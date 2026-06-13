import { createPublicClient } from "@/lib/supabase/public";
import { rankRelated } from "@/lib/ranking";
import { sanitizeSearchQuery } from "@/lib/search";
import type { Article, ArticleCard } from "@/lib/types";

const CARD_COLUMNS =
  "id,title,slug,excerpt,created_at,tags,views,reactions,cover_image,series_name";

/** Published articles for the feed, newest first (range-paged for load-more). */
export async function getFeedArticles(limit = 50, offset = 0): Promise<ArticleCard[]> {
  const sb = createPublicClient();
  const { data, error } = await sb
    .from("longform_articles")
    .select(CARD_COLUMNS)
    .eq("published", true)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
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
  return rankRelated((data ?? []) as ArticleCard[], article.tags || []);
}

/** ArticleCard plus the markdown body — used server-side to build search snippets. */
export type SearchableArticle = ArticleCard & { content: string };

/**
 * Full-text search over title/excerpt/body. `wfts` is PostgREST's
 * websearch_to_tsquery operator; on plain text columns Postgres applies
 * to_tsvector implicitly, so this needs no schema changes (see lib/search.ts).
 * Sanitizes its own input — commas/parens/quotes would corrupt the .or()
 * filter string, so this guard must live next to the interpolation.
 */
export async function searchArticles(q: string, limit = 12): Promise<SearchableArticle[]> {
  q = sanitizeSearchQuery(q);
  if (!q) return [];
  const sb = createPublicClient();
  const { data, error } = await sb
    .from("longform_articles")
    .select(`${CARD_COLUMNS},content`)
    .eq("published", true)
    .or(`title.wfts.${q},excerpt.wfts.${q},content.wfts.${q}`)
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as SearchableArticle[];
}

/** Published articles carrying a given tag, newest first. */
export async function getArticlesByTag(tag: string, limit = 50): Promise<ArticleCard[]> {
  const sb = createPublicClient();
  const { data, error } = await sb
    .from("longform_articles")
    .select(CARD_COLUMNS)
    .eq("published", true)
    .contains("tags", [tag])
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ArticleCard[];
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
