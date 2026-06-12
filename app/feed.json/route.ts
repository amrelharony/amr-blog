// JSON Feed 1.1 (https://jsonfeed.org/version/1.1) — same content as the RSS
// feed at /feed.xml: 50 newest published articles, excerpt-only items.
import { createPublicClient } from "@/lib/supabase/public";

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
      return {
        id: link,
        url: link,
        title: a.title,
        content_text: a.excerpt || a.title,
        summary: a.excerpt || undefined,
        date_published: d.toISOString(),
        tags: a.tags?.length ? a.tags : undefined,
      };
    })
    .filter(Boolean);

  const feed = {
    version: "https://jsonfeed.org/version/1.1",
    title: "The Bilingual Executive Blog — Amr Elharony",
    home_page_url: `${SITE}/`,
    feed_url: `${SITE}/feed.json`,
    description: "Deep dives on Agile, FinTech, and Digital Transformation",
    language: "en-US",
    authors: [{ name: "Amr Elharony", url: "https://amrelharony.com" }],
    items,
  };

  return new Response(JSON.stringify(feed), {
    headers: {
      "Content-Type": "application/feed+json; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
