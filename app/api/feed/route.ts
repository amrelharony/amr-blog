// Paged feed JSON backing FeedLoadMore. Anonymous + RLS-safe (cookie-less
// public client). Freshness matches the feed page's ISR window via the
// Cache-Control header only — /api/revalidate's revalidatePath does not cover
// this route, which is fine at 300 s parity.
import { NextRequest } from "next/server";
import { getFeedArticles, getArticlesByCategory } from "@/lib/queries/articles";
import { FEED_PAGE_SIZE } from "@/lib/constants";
import { CATEGORY_LABELS } from "@/lib/categories";

export const runtime = "nodejs";

// High enough to scroll the whole corpus; still bounds a malicious offset.
const MAX_OFFSET = 6000;
const CACHE = "public, s-maxage=300, stale-while-revalidate=600";

export async function GET(request: NextRequest) {
  const raw = Number(request.nextUrl.searchParams.get("offset"));
  const offset = Number.isInteger(raw) && raw >= 0 && raw <= MAX_OFFSET ? raw : 0;
  // Optional category filter (validated against the known labels).
  const catParam = request.nextUrl.searchParams.get("category");
  const category = catParam && CATEGORY_LABELS.includes(catParam) ? catParam : null;

  try {
    // Fetch one extra row as the has-more sentinel.
    const rows = category
      ? await getArticlesByCategory(category, FEED_PAGE_SIZE + 1, offset)
      : await getFeedArticles(FEED_PAGE_SIZE + 1, offset);
    return Response.json(
      { articles: rows.slice(0, FEED_PAGE_SIZE), hasMore: rows.length > FEED_PAGE_SIZE },
      { headers: { "Cache-Control": CACHE } },
    );
  } catch (e) {
    console.error("[api/feed]", e);
    return Response.json(
      { articles: [], hasMore: false },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
