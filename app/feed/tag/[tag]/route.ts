// Per-tag RSS 2.0 feed — /feed/tag/<tag> mirrors /feed/category/<slug> but
// scoped to one tag (tags are free-form, so no generateStaticParams; ISR
// caches each requested tag for an hour).
import { createPublicClient } from "@/lib/supabase/public";
import { pgTextArrayLiteral } from "@/lib/queries/articles";
import { decodeRouteParam } from "@/lib/route-param";
import { esc } from "@/lib/format";

export const revalidate = 3600;

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://blog.amrelharony.com";

export async function GET(_req: Request, { params }: { params: Promise<{ tag: string }> }) {
  // Decoded for the same reason as /tag/[tag]: the param can arrive percent-encoded.
  const tag = decodeRouteParam((await params).tag || "");
  const clean = tag.trim().slice(0, 50);
  if (!clean) return new Response("Not found", { status: 404 });

  const sb = createPublicClient();
  const { data, error } = await sb
    .from("longform_articles")
    .select("title,slug,excerpt,created_at,tags")
    .eq("published", true)
    .contains("tags", pgTextArrayLiteral([clean]))
    .order("created_at", { ascending: false })
    .limit(50);
  // Throw on a DB error so a transient failure doesn't get cached as a 404 (which
  // some feed readers treat as "feed gone" and auto-unsubscribe from).
  if (error) throw error;
  const articles = (data ?? []) as {
    title: string;
    slug: string;
    excerpt: string | null;
    created_at: string;
    tags: string[] | null;
  }[];
  if (articles.length === 0) return new Response("Not found", { status: 404 });

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
      <guid>${link}</guid>
      ${cats}
    </item>`;
    })
    .filter(Boolean)
    .join("\n");

  const self = `${SITE}/feed/tag/${encodeURIComponent(clean)}`;
  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${esc(clean)} — Fintech Bilinguals</title>
  <link>${SITE}/tag/${encodeURIComponent(clean)}</link>
  <description>Articles tagged "${esc(clean)}" by Amr Elharony.</description>
  <language>en-us</language>
  <atom:link href="${self}" rel="self" type="application/rss+xml"/>
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
