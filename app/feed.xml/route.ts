// RSS 2.0 feed — ported from api/rss.js. Served at /feed.xml.
import { createPublicClient } from "@/lib/supabase/public";
import { esc } from "@/lib/format";

export const revalidate = 3600;

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://blog.amrelharony.com";

export async function GET() {
  const sb = createPublicClient();
  const { data } = await sb
    .from("longform_articles")
    .select("title,slug,excerpt,created_at,tags")
    .eq("published", true)
    .order("created_at", { ascending: false })
    .limit(50);
  const articles = (data ?? []) as {
    title: string;
    slug: string;
    excerpt: string | null;
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
      <pubDate>${d.toUTCString()}</pubDate>
      <guid isPermaLink="true">${link}</guid>
      <dc:creator>Amr Elharony</dc:creator>
      ${cats}
    </item>`;
    })
    .filter(Boolean)
    .join("\n");

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel>
  <title>The Bilingual Executive Blog — Amr Elharony</title>
  <link>${SITE}/</link>
  <description>Deep dives on Agile, FinTech, and Digital Transformation</description>
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
