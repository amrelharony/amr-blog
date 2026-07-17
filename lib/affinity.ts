// Pure tag-affinity scoring for "For You" recommendations. Builds a per-tag
// interest profile from the reader's local reading history (engagement +
// recency), then ranks candidate articles against it. No DOM, no Supabase,
// no window — all signals are passed in, so this stays unit-testable and
// isomorphic. (The history itself lives in localStorage; see ForYou.tsx.)
import type { ArticleCard } from "@/lib/types";

/** Minimal structural shape of a `_lb_reading_history` entry (see ReadingTracker). */
export interface HistoryEntry {
  slug?: string;
  tags?: string[];
  progress?: number;
  completed?: boolean;
  last_read_at?: string;
}

const HALF_LIFE_DAYS = 30;
const VISIT_FLOOR = 0.15; // a barely-scrolled article still nudges affinity

/**
 * Per-tag interest weights. Each read article contributes
 *   engagement × recencyDecay
 * to every tag it carries, where engagement is 1 for completed reads and
 * max(progress/100, floor) otherwise, and recency halves every ~30 days.
 * `now` is injected so tests are deterministic.
 */
export function buildAffinity(
  history: Record<string, HistoryEntry>,
  now = Date.now(),
): Map<string, number> {
  const affinity = new Map<string, number>();
  for (const entry of Object.values(history || {})) {
    const tags = entry?.tags;
    if (!tags || tags.length === 0) continue;
    // Clamp progress to [0,100] before scaling: a corrupt tracker value (>100) would
    // otherwise make one glitched partial read outweigh a genuine completed read (=1).
    const engagement = entry.completed ? 1 : Math.max(Math.min(entry.progress || 0, 100) / 100, VISIT_FLOOR);
    const t = entry.last_read_at ? new Date(entry.last_read_at).getTime() : NaN;
    const ageDays = Number.isFinite(t) ? Math.max(0, (now - t) / 86_400_000) : 0;
    const decay = Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
    const w = engagement * decay;
    for (const tag of tags) {
      affinity.set(tag, (affinity.get(tag) || 0) + w);
    }
  }
  return affinity;
}

/**
 * Mean affinity across an article's tags — averaging (not summing) keeps a
 * tag-stuffed article from outranking a focused match. No tags → 0.
 */
export function scoreArticle(
  tags: string[] | null | undefined,
  affinity: Map<string, number>,
): number {
  if (!tags || tags.length === 0) return 0;
  let sum = 0;
  for (const tag of tags) sum += affinity.get(tag) || 0;
  return sum / tags.length;
}

/**
 * Rank candidates by affinity, dropping anything the reader has already
 * touched (excludeSlugs) or with no affinity at all. Tiebreak views, then
 * recency. Does not mutate `pool`.
 */
export function rankForYou(
  pool: ArticleCard[],
  affinity: Map<string, number>,
  { excludeSlugs, n }: { excludeSlugs: Set<string>; n: number },
): ArticleCard[] {
  const scored = pool
    .filter((a) => !excludeSlugs.has(a.slug))
    .map((a) => ({ a, s: scoreArticle(a.tags, affinity) }))
    .filter((x) => x.s > 0);
  scored.sort(
    (x, y) =>
      y.s - x.s ||
      (y.a.views || 0) - (x.a.views || 0) ||
      y.a.created_at.localeCompare(x.a.created_at),
  );
  return scored.slice(0, n).map((x) => x.a);
}
