// Per-category RSS 2.0 feed — /feed/category/<slug>.xml mirrors /feed.xml but
// scoped to one category. Advertised from the category page <head>.
import { createPublicClient } from "@/lib/supabase/public";
import { esc } from "@/lib/format";
import { categoryBySlug, CATEGORIES } from "@/lib/categories";

export const revalidate = 3600;

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://blog.amrelharony.com";

export function generateStaticParams() {
  return CATEGORIES.map((c) => ({ category: c.slug }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const cat = categoryBySlug(category);
  if (!cat) return new Response("Not found", { status: 404 });

  const sb = createPublicClient();
  const { data, error } = await sb
    .from("longform_articles")
    .select("title,slug,excerpt,created_at,tags")
    .eq("published", true)
    .eq("category", cat.label)
    .order("created_at", { ascending: false })
    .limit(50);
  // Throw on a DB error rather than caching an empty category feed for an hour.
  if (error) throw error;
  const articles = (data ?? []) as {
    title: string;
    slug: string;
    excerpt: string | null;
    created_at: string;
    tags: string[] | null;
  }[];

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

  const self = `${SITE}/feed/category/${cat.slug}`;
  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${esc(cat.label)} — Fintech Bilinguals</title>
  <link>${SITE}/category/${cat.slug}</link>
  <description>${esc(cat.blurb)}</description>
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
