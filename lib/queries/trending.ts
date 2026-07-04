// Time-windowed popularity (db/migrations/0012). Deliberately fail-open: until
// the migration is applied — or if the RPC ever errors — every surface that
// renders trending simply renders nothing.
import { createPublicClient } from "@/lib/supabase/public";
import type { ArticleCard } from "@/lib/types";

export type TrendingArticle = ArticleCard & { recent_views: number };

export async function getTrendingArticles(days = 7, count = 5): Promise<TrendingArticle[]> {
  try {
    const sb = createPublicClient();
    const { data, error } = await sb.rpc("get_trending_articles", {
      p_days: days,
      p_count: count,
    });
    if (error) return [];
    return (data ?? []) as TrendingArticle[];
  } catch {
    return [];
  }
}
