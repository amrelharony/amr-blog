import { createPublicClient } from "@/lib/supabase/public";
import { rankRelated } from "@/lib/ranking";
import { sanitizeSearchQuery } from "@/lib/search";
import type { Article, ArticleCard } from "@/lib/types";

const CARD_COLUMNS =
  "id,title,slug,excerpt,created_at,tags,views,reactions,cover_image,series_name,category";

/** Published articles for the feed, newest first (range-paged for load-more). */
export async function getFeedArticles(limit = 50, offset = 0): Promise<ArticleCard[]> {
  const sb = createPublicClient();
  const { data, error } = await sb
    .from("longform_articles")
    .select(CARD_COLUMNS)
    .eq("published", true)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false }) // stable tiebreaker so offset paging can't skip/dupe on tied dates
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

// PostgREST caps a single response at ~1000 rows, so anything that must cover the
// whole table (generateStaticParams, the sitemap) has to page explicitly.
const PG_PAGE = 1000;

/** All published slugs — for generateStaticParams. Paged past the 1000-row cap. */
export async function getAllPublishedSlugs(): Promise<string[]> {
  const sb = createPublicClient();
  const out: string[] = [];
  for (let from = 0; from < 200000; from += PG_PAGE) {
    const { data, error } = await sb
      .from("longform_articles")
      .select("slug")
      .eq("published", true)
      .order("id", { ascending: true })
      .range(from, from + PG_PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as { slug: string }[];
    out.push(...rows.map((r) => r.slug));
    if (rows.length < PG_PAGE) break;
  }
  return out;
}

/** Every published article's sitemap fields (slug/date), paged past the cap. */
export async function getAllPublishedForSitemap(): Promise<
  Pick<ArticleCard, "slug" | "created_at">[]
> {
  const sb = createPublicClient();
  const out: Pick<ArticleCard, "slug" | "created_at">[] = [];
  for (let from = 0; from < 200000; from += PG_PAGE) {
    const { data, error } = await sb
      .from("longform_articles")
      .select("slug,created_at")
      .eq("published", true)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + PG_PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as Pick<ArticleCard, "slug" | "created_at">[];
    out.push(...rows);
    if (rows.length < PG_PAGE) break;
  }
  return out;
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

/** Published articles in a category, newest first — range-paged for archives. */
export async function getArticlesByCategory(
  category: string,
  limit = 24,
  offset = 0,
): Promise<ArticleCard[]> {
  const sb = createPublicClient();
  const { data, error } = await sb
    .from("longform_articles")
    .select(CARD_COLUMNS)
    .eq("published", true)
    .eq("category", category)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false }) // stable tiebreaker so offset paging can't skip/dupe on tied dates
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return (data ?? []) as ArticleCard[];
}

/** Exact count of published articles in a category (for pagination + JSON-LD). */
export async function getCategoryCount(category: string): Promise<number> {
  const sb = createPublicClient();
  const { count, error } = await sb
    .from("longform_articles")
    .select("id", { count: "exact", head: true })
    .eq("published", true)
    .eq("category", category);
  if (error) throw error;
  return count ?? 0;
}

/** Published articles carrying a given tag, newest first — range-paged for archives. */
export async function getArticlesByTag(
  tag: string,
  limit = 24,
  offset = 0,
): Promise<ArticleCard[]> {
  const sb = createPublicClient();
  const { data, error } = await sb
    .from("longform_articles")
    .select(CARD_COLUMNS)
    .eq("published", true)
    .contains("tags", [tag])
    .order("created_at", { ascending: false })
    .order("id", { ascending: false }) // stable tiebreaker so offset paging can't skip/dupe on tied dates
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return (data ?? []) as ArticleCard[];
}

/** Exact count of published articles carrying a given tag (for pagination + count). */
export async function getTagCount(tag: string): Promise<number> {
  const sb = createPublicClient();
  const { count, error } = await sb
    .from("longform_articles")
    .select("id", { count: "exact", head: true })
    .eq("published", true)
    .contains("tags", [tag]);
  if (error) throw error;
  return count ?? 0;
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
