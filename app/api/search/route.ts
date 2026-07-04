// Full-text search endpoint backing FeedSearch and the command palette.
// Anonymous + RLS-safe (cookie-less public client), so responses are CDN
// cacheable. GET route handlers are dynamic by default (Next 15+); freshness
// is controlled purely by the Cache-Control header below.
import { NextRequest } from "next/server";
import { searchArticles, matchArticlesByVector } from "@/lib/queries/articles";
import { searchThoughts } from "@/lib/queries/microblog";
import { categoryByLabel } from "@/lib/categories";
import { embedText } from "@/lib/embeddings";
import {
  EMPTY_SEARCH_RESPONSE,
  buildSnippet,
  fuseResults,
  matchedTags,
  rankSearchResults,
  sanitizeSearchQuery,
  type SearchResponse,
} from "@/lib/search";

// Optional semantic arm (SEARCH_HYBRID=1): embed the query, pull vector
// neighbours, and fuse with the full-text ranking. Fails open to FTS-only on
// any error (embeddings unconfigured, migration not applied, timeouts).
async function vectorArm(q: string, limit: number) {
  if (process.env.SEARCH_HYBRID !== "1") return [];
  try {
    const vector = await embedText(q);
    return await matchArticlesByVector(vector, limit);
  } catch (e) {
    console.error("[api/search] vector arm fail-open:", e instanceof Error ? e.message : e);
    return [];
  }
}

export const runtime = "nodejs";

const CACHE_OK = "public, s-maxage=60, stale-while-revalidate=300";

function json(body: SearchResponse, cacheControl: string) {
  return Response.json(body, { headers: { "Cache-Control": cacheControl } });
}

export async function GET(request: NextRequest) {
  const q = sanitizeSearchQuery(request.nextUrl.searchParams.get("q") || "");
  if (q.length < 2) return json(EMPTY_SEARCH_RESPONSE, CACHE_OK);
  // Optional category narrowing (used by /search). Unknown labels → no filter.
  const rawCat = request.nextUrl.searchParams.get("category") || "";
  const category = categoryByLabel(rawCat)?.label ?? null;

  try {
    const [articleRows, thoughtRows, vecRows] = await Promise.all([
      searchArticles(q, 12, category),
      searchThoughts(q),
      vectorArm(q, 12),
    ]);
    let ranked = rankSearchResults(articleRows, q);
    if (vecRows.length > 0) {
      const vecFiltered = category ? vecRows.filter((v) => v.category === category) : vecRows;
      ranked = fuseResults(ranked, vecFiltered, (a) => a.slug, 12);
    }
    return json(
      {
        articles: ranked.map((a) => ({
          type: "article" as const,
          slug: a.slug,
          title: a.title,
          excerpt: a.excerpt || "",
          snippet: buildSnippet(a.content, q),
          tags: a.tags || [],
          created_at: a.created_at,
          views: a.views || 0,
        })),
        thoughts: thoughtRows.map((t) => ({
          type: "thought" as const,
          id: t.id,
          snippet: buildSnippet(t.content, q),
          created_at: t.created_at,
        })),
        tags: matchedTags(ranked, q),
      },
      CACHE_OK,
    );
  } catch (e) {
    // Degrade to empty rather than erroring the UI; don't cache the outage.
    console.error("[api/search]", e);
    return json(EMPTY_SEARCH_RESPONSE, "no-store");
  }
}
