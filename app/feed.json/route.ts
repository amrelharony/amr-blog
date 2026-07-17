// JSON Feed 1.1 (https://jsonfeed.org/version/1.1) — same 50 items as
// /feed.xml with full sanitized content_html. Advertised from the layout's
// alternates.types.
import { createPublicClient } from "@/lib/supabase/public";
import { renderArticleHtml } from "@/lib/markdown/parse";

export const revalidate = 3600;

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://blog.amrelharony.com";

export async function GET() {
  const sb = createPublicClient();
  const { data, error } = await sb
    .from("longform_articles")
    .select("title,slug,excerpt,content,created_at,updated_at,tags")
    .eq("published", true)
    .order("created_at", { ascending: false })
    .limit(50);
  // Throw on a DB error rather than caching an empty feed for an hour (ISR keeps
  // serving the last good render).
  if (error) throw error;
  const articles = (data ?? []) as {
    title: string;
    slug: string;
    excerpt: string | null;
    content: string | null;
    created_at: string;
    updated_at: string | null;
    tags: string[] | null;
  }[];

  const feed = {
    version: "https://jsonfeed.org/version/1.1",
    title: "Fintech Bilinguals — Amr Elharony",
    home_page_url: `${SITE}/`,
    feed_url: `${SITE}/feed.json`,
    description: "Speaking both business and tech in fintech.",
    language: "en",
    authors: [{ name: "Amr Elharony", url: "https://amrelharony.com" }],
    items: articles
      .filter((a) => !isNaN(new Date(a.created_at).getTime()))
      .map((a) => ({
        id: `${SITE}/p/${encodeURIComponent(a.slug)}`,
        url: `${SITE}/p/${encodeURIComponent(a.slug)}`,
        title: a.title,
        summary: a.excerpt || undefined,
        content_html: renderArticleHtml(a.content),
        date_published: new Date(a.created_at).toISOString(),
        ...(a.updated_at ? { date_modified: new Date(a.updated_at).toISOString() } : {}),
        ...(a.tags?.length ? { tags: a.tags } : {}),
      })),
  };

  return Response.json(feed, {
    headers: {
      "Content-Type": "application/feed+json; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
