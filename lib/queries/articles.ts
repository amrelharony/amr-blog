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

/**
 * Related articles — mirrors renderRelated() in Js/blog-article.js: pull the 20
 * most recent published (excluding current), rank by tag-overlap then views, top 4.
 */
export async function getRelatedArticles(article: {
  id: string;
  tags: string[];
}): Promise<ArticleCard[]> {
  const sb = createPublicClient();
  const { data, error } = await sb
    .from("longform_articles")
    .select(CARD_COLUMNS)
    .eq("published", true)
    .neq("id", article.id)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  const tags = article.tags || [];
  const pool = (data ?? []) as ArticleCard[];
  const overlap = (a: ArticleCard) => (a.tags || []).filter((t) => tags.includes(t)).length;
  pool.sort((a, b) => overlap(b) - overlap(a) || (b.views || 0) - (a.views || 0));
  return pool.slice(0, 4);
}

export interface SeriesSibling {
  id: string;
  title: string;
  slug: string;
  series_order: number;
}

/** All published articles in a series, ordered (for prev/next nav). */
export async function getSeriesSiblings(seriesName: string): Promise<SeriesSibling[]> {
  const sb = createPublicClient();
  const { data, error } = await sb
    .from("longform_articles")
    .select("id,title,slug,series_order")
    .eq("published", true)
    .eq("series_name", seriesName)
    .order("series_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as SeriesSibling[];
}
