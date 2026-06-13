// Candidate pool for the "For You" strip — a thin, cacheable window of recent
// articles. Ranking happens entirely client-side (ForYou.tsx) against the
// reader's localStorage history: this route takes NO params and receives NO
// history, so personalization never leaves the browser. Anonymous + RLS-safe
// (cookie-less public client), same freshness as /api/feed.
import { getFeedArticles } from "@/lib/queries/articles";

export const runtime = "nodejs";

const POOL_SIZE = 40;
const CACHE = "public, s-maxage=300, stale-while-revalidate=600";

export async function GET() {
  try {
    const articles = await getFeedArticles(POOL_SIZE);
    return Response.json({ articles }, { headers: { "Cache-Control": CACHE } });
  } catch (e) {
    console.error("[api/recommend]", e);
    return Response.json({ articles: [] }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
