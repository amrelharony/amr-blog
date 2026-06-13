// Full-text search endpoint backing FeedSearch and the command palette.
// Anonymous + RLS-safe (cookie-less public client), so responses are CDN
// cacheable. GET route handlers are dynamic by default (Next 15+); freshness
// is controlled purely by the Cache-Control header below.
import { NextRequest } from "next/server";
import { searchArticles } from "@/lib/queries/articles";
import { searchThoughts } from "@/lib/queries/microblog";
import {
  EMPTY_SEARCH_RESPONSE,
  buildSnippet,
  matchedTags,
  rankSearchResults,
  sanitizeSearchQuery,
  type SearchResponse,
} from "@/lib/search";

export const runtime = "nodejs";

const CACHE_OK = "public, s-maxage=60, stale-while-revalidate=300";

function json(body: SearchResponse, cacheControl: string) {
  return Response.json(body, { headers: { "Cache-Control": cacheControl } });
}

export async function GET(request: NextRequest) {
  const q = sanitizeSearchQuery(request.nextUrl.searchParams.get("q") || "");
  if (q.length < 2) return json(EMPTY_SEARCH_RESPONSE, CACHE_OK);

  try {
    const [articleRows, thoughtRows] = await Promise.all([searchArticles(q), searchThoughts(q)]);
    const ranked = rankSearchResults(articleRows, q);
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
