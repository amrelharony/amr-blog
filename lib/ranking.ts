// Pure ranking/stats helpers shared by the feed, tag pages, and related-articles
// query — extracted so they can be unit-tested without Supabase.
import type { ArticleCard } from "@/lib/types";

/** Total reaction count across all emoji buckets. */
export function rxCount(r: Record<string, number> | null | undefined): number {
  return Object.values(r || {}).reduce((s, n) => s + (n || 0), 0);
}

/** "TRENDING" badge threshold — mirrors the original feed logic. */
export function isTrending(a: ArticleCard): boolean {
  return (a.views || 0) >= 50 || rxCount(a.reactions) >= 10;
}

/**
 * Related-articles ranking (mirrors renderRelated() in Js/blog-article.js):
 * tag-overlap first, views as tiebreak, top n.
 */
export function rankRelated(pool: ArticleCard[], tags: string[], n = 4): ArticleCard[] {
  const overlap = (a: ArticleCard) => (a.tags || []).filter((t) => tags.includes(t)).length;
  return [...pool].sort((a, b) => overlap(b) - overlap(a) || (b.views || 0) - (a.views || 0)).slice(0, n);
}
