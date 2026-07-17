// RSS 2.0 feed — ported from api/rss.js. Served at /feed.xml.
// Full-content: each item carries the sanitized rendered HTML in
// <content:encoded> (readers get whole articles), excerpt stays in
// <description>. The render pipeline is the same linear, ReDoS-bounded one the
// site uses (lib/markdown/parse.ts), run at most once per revalidate hour.
import { createPublicClient } from "@/lib/supabase/public";
import { esc } from "@/lib/format";
import { renderArticleHtml } from "@/lib/markdown/parse";

export const revalidate = 3600;

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://blog.amrelharony.com";

/** CDATA-wrap arbitrary HTML; a literal "]]>" inside is split across sections. */
function cdata(html: string): string {
  // Strip XML-1.0-illegal C0 control chars first (keep tab/LF/CR): CDATA does NOT
  // legalize them, so one stray \x0B in a single article body would make the WHOLE
  // feed un-parseable for every reader. Mirrors esc() in lib/format.ts.
  const clean = html.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
  return `<![CDATA[${clean.replace(/\]\]>/g, "]]]]><![CDATA[>")}]]>`;
}

export async function GET() {
  const sb = createPublicClient();
  const { data, error } = await sb
    .from("longform_articles")
    .select("title,slug,excerpt,content,created_at,tags")
    .eq("published", true)
    .order("created_at", { ascending: false })
    .limit(50);
  // Throw on a DB error rather than silently caching an empty feed for an hour
  // (ISR keeps serving the last good render; a 0-item feed can reset reader state).
  if (error) throw error;
  const articles = (data ?? []) as {
    title: string;
    slug: string;
    excerpt: string | null;
    content: string | null;
    created_at: string;
    tags: string[] | null;
  }[];

  // Drop items with unparseable created_at rather than floating them to "now".
  const items = articles
    .map((a) => {
      const d = new Date(a.created_at);
      if (isNaN(d.getTime())) return null;
      const link = `${SITE}/p/${encodeURIComponent(a.slug)}`;
      const cats = (a.tags || []).map((t) => `<category>${esc(t)}</category>`).join("");
      return `    <item>
      <title>${esc(a.title)}</title>
      <link>${link}</link>
      <description>${esc(a.excerpt || "")}</description>
      <content:encoded>${cdata(renderArticleHtml(a.content))}</content:encoded>
      <pubDate>${d.toUTCString()}</pubDate>
      <guid>${link}</guid>
      ${cats}
    </item>`;
    })
    .filter(Boolean)
    .join("\n");

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel>
  <title>Fintech Bilinguals — Amr Elharony</title>
  <link>${SITE}/</link>
  <description>Speaking both business and tech in fintech.</description>
  <language>en-us</language>
  <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/>
${items}
</channel>
</rss>`;

  return new Response(rss, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
