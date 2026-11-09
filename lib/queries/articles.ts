import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/public";
import { rankRelated } from "@/lib/ranking";
import { sanitizeSearchQuery } from "@/lib/search";
import type { Article, ArticleCard } from "@/lib/types";

const CARD_COLUMNS =
  "id,title,slug,excerpt,created_at,tags,views,reactions,cover_image,series_name,category";

/**
 * Build a quoted Postgres text-array literal for `.contains()`.
 *
 * postgrest-js serializes the ARRAY form as `cs.{a,b}` by raw `value.join(",")`
 * (postgrest-js `contains()`), with no quoting — so a tag is NOT parameterized the
 * way the call sites used to assume. A tag containing a comma silently became two
 * array elements ("has both tags" instead of the one literal tag), and a `{`/`}`
 * produced a malformed array literal that PostgREST rejects — surfacing as a 500 on
 * a public feed URL. Passing a STRING instead makes postgrest-js emit it verbatim,
 * so we do the quoting ourselves: wrap in double quotes, backslash-escape `\` and `"`.
 */
export function pgTextArrayLiteral(values: string[]): string {
  return `{${values.map((v) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")}}`;
}

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

// Explicit column list (not "*") so heavyweight non-render columns — notably
// the 384-float `embedding` vector — never ride along on every article render.
const ARTICLE_COLUMNS =
  "id,created_at,updated_at,title,slug,excerpt,content,cover_image,tags,category," +
  "source_url,published,views,reactions,scheduled_at,linkedin_posted,series_name," +
  "series_order,tldr,pdf_url,pdf_name";

/**
 * One published article by slug, or null.
 *
 * Wrapped in React `cache` because generateMetadata and the page both call it in
 * one render. Next merges identical fetches only while they carry no AbortSignal,
 * and the public client's timeout (lib/supabase/public.ts) puts one on every
 * request. Without this, every article render would read the full row twice.
 */
export const getArticleBySlug = cache(async (slug: string): Promise<Article | null> => {
  const sb = createPublicClient();
  const { data, error } = await sb
    .from("longform_articles")
    .select(ARTICLE_COLUMNS)
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as Article) ?? null;
});

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

/** Every published article's archive fields (slug/title/date), paged past the cap. */
export async function getAllPublishedForArchive(): Promise<
  Pick<ArticleCard, "slug" | "title" | "created_at">[]
> {
  const sb = createPublicClient();
  const out: Pick<ArticleCard, "slug" | "title" | "created_at">[] = [];
  for (let from = 0; from < 200000; from += PG_PAGE) {
    const { data, error } = await sb
      .from("longform_articles")
      .select("slug,title,created_at")
      .eq("published", true)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + PG_PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as Pick<ArticleCard, "slug" | "title" | "created_at">[];
    out.push(...rows);
    if (rows.length < PG_PAGE) break;
  }
  return out;
}

/** Every published article's tags array (for the /tags index), paged past the cap. */
export async function getAllPublishedTagRows(): Promise<{ tags: string[] | null }[]> {
  const sb = createPublicClient();
  const out: { tags: string[] | null }[] = [];
  for (let from = 0; from < 200000; from += PG_PAGE) {
    const { data, error } = await sb
      .from("longform_articles")
      .select("tags")
      .eq("published", true)
      .order("id", { ascending: true })
      .range(from, from + PG_PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as { tags: string[] | null }[];
    out.push(...rows);
    if (rows.length < PG_PAGE) break;
  }
  return out;
}

/** series_name/date pairs of all published series parts (for the /series index), paged. */
export async function getAllSeriesRows(): Promise<
  { series_name: string | null; created_at: string }[]
> {
  const sb = createPublicClient();
  const out: { series_name: string | null; created_at: string }[] = [];
  for (let from = 0; from < 200000; from += PG_PAGE) {
    const { data, error } = await sb
      .from("longform_articles")
      .select("series_name,created_at")
      .eq("published", true)
      .not("series_name", "is", null)
      .order("id", { ascending: true })
      .range(from, from + PG_PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as { series_name: string | null; created_at: string }[];
    out.push(...rows);
    if (rows.length < PG_PAGE) break;
  }
  return out;
}

/**
 * Related articles — semantic (pgvector cosine, via the match_related_articles
 * RPC from db/migrations/0011) when the article is embedded; otherwise the
 * original tag-overlap ranking over the 20 most recent. The fallback also
 * covers projects where the migration hasn't been applied yet: the RPC call
 * errors, we log once and rank by tags — nothing breaks.
 */
export async function getRelatedArticles(
  article: {
    id: string;
    tags: string[];
  },
  n = 4,
): Promise<ArticleCard[]> {
  const sb = createPublicClient();

  try {
    const { data, error } = await sb.rpc("match_related_articles", {
      p_article_id: article.id,
      p_count: n,
    });
    if (!error && Array.isArray(data) && data.length > 0) {
      return data as ArticleCard[];
    }
  } catch {
    /* fall through to tag ranking */
  }

  const { data, error } = await sb
    .from("longform_articles")
    .select(CARD_COLUMNS)
    .eq("published", true)
    .neq("id", article.id)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return rankRelated((data ?? []) as ArticleCard[], article.tags || [], n);
}

/**
 * "Read next" pick + related grid from ONE ranked pool: the top pick becomes
 * the prominent Read-next card, the rest feed the related grid. Kept as a
 * single seam so semantic (vector) ranking can replace the pool without
 * touching the article page.
 */
export async function getReadNextAndRelated(article: {
  id: string;
  tags: string[];
}): Promise<{ readNext: ArticleCard | null; related: ArticleCard[] }> {
  const ranked = await getRelatedArticles(article, 5);
  return { readNext: ranked[0] ?? null, related: ranked.slice(1) };
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
export async function searchArticles(
  q: string,
  limit = 12,
  category?: string | null,
): Promise<SearchableArticle[]> {
  q = sanitizeSearchQuery(q);
  if (!q) return [];
  const sb = createPublicClient();
  let query = sb
    .from("longform_articles")
    .select(`${CARD_COLUMNS},content`)
    .eq("published", true)
    .or(`title.wfts.${q},excerpt.wfts.${q},content.wfts.${q}`);
  if (category) query = query.eq("category", category);
  // LIMIT without ORDER BY leaves the *selection* to heap order: Postgres stops the
  // scan at the first `limit` matches, so on a query matching hundreds of bodies the
  // title match that rankSearchResults would score highest is never fetched, and the
  // same query can return a different set after a VACUUM or under a parallel scan.
  // Ranking happens in the caller; this just has to pick a deterministic, sensible
  // candidate set. Newest-first with the usual id tiebreaker matches every other list
  // query in this file.
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as SearchableArticle[];
}

/**
 * Vector-similarity hits for the hybrid search arm (match_articles RPC from
 * db/migrations/0011). Rows carry no content (snippets fall back to excerpts).
 */
export async function matchArticlesByVector(
  vector: number[],
  limit = 12,
): Promise<SearchableArticle[]> {
  const sb = createPublicClient();
  const { data, error } = await sb.rpc("match_articles", {
    p_embedding: JSON.stringify(vector),
    p_count: limit,
  });
  if (error) throw error;
  return ((data ?? []) as ArticleCard[]).map(
    (a) => ({ ...a, content: "" }) as SearchableArticle,
  );
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
    .contains("tags", pgTextArrayLiteral([tag]))
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
    .contains("tags", pgTextArrayLiteral([tag]));
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
    // created_at (then id) breaks ties: the editor defaults every part to
    // series_order = 0, and without a stable tiebreaker Postgres row order is
    // unspecified, so "Part N of M" and prev/next nav could swap between ISR builds.
    .order("series_order", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw error;
  return (data ?? []) as SeriesSibling[];
}
