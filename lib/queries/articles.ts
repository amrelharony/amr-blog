import { createPublicClient } from "@/lib/supabase/public";
import type { Article, ArticleCard } from "@/lib/types";

const CARD_COLUMNS =
  "id,title,slug,excerpt,created_at,tags,views,reactions,cover_image,series_name";

/** Published articles for the feed, newest first. */
export async function getFeedArticles(limit = 50): Promise<ArticleCard[]> {
  const sb = createPublicClient();
  const { data, error } = await sb
    .from("longform_articles")
    .select(CARD_COLUMNS)
    .eq("published", true)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ArticleCard[];
}

/** One published article by slug, or null. */
export async function getArticleBySlug(slug: string): Promise<Article | null> {
  const sb = createPublicClient();
  const { data, error } = await sb
    .from("longform_articles")
    .select("*")
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();
  if (error) throw error;
  return (data as Article) ?? null;
}

/** All published slugs — for generateStaticParams. */
export async function getAllPublishedSlugs(): Promise<string[]> {
  const sb = createPublicClient();
  const { data, error } = await sb
    .from("longform_articles")
    .select("slug")
    .eq("published", true);
  if (error) throw error;
  return (data ?? []).map((r: { slug: string }) => r.slug);
}

/** Articles sharing the most tags with the given one (parity: related list). */
export async function getRelatedArticles(
  current: ArticleCard,
  limit = 3,
): Promise<ArticleCard[]> {
  const sb = createPublicClient();
  const { data, error } = await sb
    .from("longform_articles")
    .select(CARD_COLUMNS)
    .eq("published", true)
    .neq("slug", current.slug)
    .overlaps("tags", current.tags?.length ? current.tags : ["__none__"])
    .order("views", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ArticleCard[];
}
