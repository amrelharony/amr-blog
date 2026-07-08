// Admin analytics aggregations (category/tag breakdowns, views-per-day).
// Rows come down as narrow per-article facts — paged past PostgREST's
// ~1000-row cap — and are aggregated here in JS. Deliberately no new RPCs:
// migration rollout is a manual dashboard step (docs/upgrade-rollout.md), and
// at single-admin traffic three ~1000-row requests per page view are cheap.
import type { SupabaseClient } from "@supabase/supabase-js";
import { CATEGORY_LABELS } from "@/lib/categories";

const PG = 1000;

export const UNCATEGORIZED_LABEL = "Uncategorized";

export interface ArticleFact {
  id: string;
  category: string | null;
  tags: string[] | null;
  views: number | null;
  published: boolean;
}

export interface CategoryBucket {
  label: string;
  articles: number;
  published: number;
  totalViews: number;
  /** Views per PUBLISHED article (views only accrue on live pages). */
  avgViews: number;
}

export interface TagBucket {
  tag: string;
  count: number;
  views: number;
}

/** One point per UTC day, `day` as YYYY-MM-DD. */
export interface DayPoint {
  day: string;
  views: number;
}

/**
 * Every article's aggregation facts (5 narrow columns). Throws on any page
 * error or if the runaway cap is hit — a silently-partial set would skew every
 * breakdown that consumes it (same rationale as the subscribers page loader).
 */
export async function fetchAllArticleFacts(sb: SupabaseClient): Promise<ArticleFact[]> {
  const all: ArticleFact[] = [];
  for (let page = 0; page < 20; page++) {
    const from = page * PG;
    const { data, error } = await sb
      .from("longform_articles")
      .select("id,category,tags,views,published")
      .order("id", { ascending: true }) // stable PK order so paging can't skip/dupe
      .range(from, from + PG - 1);
    if (error) throw error;
    const rows = (data ?? []) as ArticleFact[];
    all.push(...rows);
    if (rows.length < PG) return all;
  }
  throw new Error("fetchAllArticleFacts: exceeded 20-page runaway cap");
}

/**
 * Bucket per canonical category (all four render even at 0), then
 * Uncategorized (category IS NULL), then any unknown non-null labels so bad
 * data stays visible instead of vanishing.
 */
export function aggregateCategories(rows: ArticleFact[]): CategoryBucket[] {
  const order: string[] = [...CATEGORY_LABELS, UNCATEGORIZED_LABEL];
  const map = new Map<string, CategoryBucket>();
  const bucket = (label: string): CategoryBucket => {
    let b = map.get(label);
    if (!b) {
      b = { label, articles: 0, published: 0, totalViews: 0, avgViews: 0 };
      map.set(label, b);
      if (!order.includes(label)) order.push(label);
    }
    return b;
  };
  for (const label of order) bucket(label);

  for (const r of rows) {
    const b = bucket(r.category ?? UNCATEGORIZED_LABEL);
    b.articles += 1;
    if (r.published) b.published += 1;
    b.totalViews += r.views || 0;
  }
  for (const b of map.values()) {
    b.avgViews = b.published > 0 ? Math.round(b.totalViews / b.published) : 0;
  }
  return order.map((label) => map.get(label)!);
}

/** Top tags by article count (ties: views, then name), skipping null/blank tags. */
export function aggregateTags(rows: ArticleFact[], topN = 15): TagBucket[] {
  const map = new Map<string, TagBucket>();
  for (const r of rows) {
    for (const raw of r.tags ?? []) {
      const tag = (raw || "").trim();
      if (!tag) continue;
      const b = map.get(tag) ?? { tag, count: 0, views: 0 };
      b.count += 1;
      b.views += r.views || 0;
      map.set(tag, b);
    }
  }
  return [...map.values()]
    .sort((a, b) => b.count - a.count || b.views - a.views || a.tag.localeCompare(b.tag))
    .slice(0, Math.max(0, topN));
}

/**
 * Zero-filled contiguous series of the trailing `days` UTC days (oldest first,
 * ending today), summing rollup rows that share a day.
 */
export function sumViewsByDay(
  rows: { day: string; views: number | null }[],
  days: number,
  today: Date = new Date(),
): DayPoint[] {
  const byDay = new Map<string, number>();
  for (const r of rows) {
    const key = (r.day || "").slice(0, 10);
    if (!key) continue;
    byDay.set(key, (byDay.get(key) || 0) + (r.views || 0));
  }
  const end = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const out: DayPoint[] = [];
  for (let i = Math.max(0, days) - 1; i >= 0; i--) {
    const day = new Date(end - i * 86_400_000).toISOString().slice(0, 10);
    out.push({ day, views: byDay.get(day) || 0 });
  }
  return out;
}

/**
 * Site-wide views per day from the article_view_daily rollup. The table has
 * RLS with NO policies (0012), so this requires the SERVICE-ROLE client —
 * call it only behind requireAdmin(). Throws rather than charting a partial
 * window; the analytics page wraps it fail-open.
 */
export async function fetchViewSeries(service: SupabaseClient, days = 30): Promise<DayPoint[]> {
  const today = new Date();
  const end = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const cutoff = new Date(end - (Math.max(1, days) - 1) * 86_400_000).toISOString().slice(0, 10);

  const all: { day: string; views: number | null }[] = [];
  for (let page = 0; page < 50; page++) {
    const from = page * PG;
    const { data, error } = await service
      .from("article_view_daily")
      .select("day,views")
      .gte("day", cutoff)
      .order("day", { ascending: true })
      .order("article_id", { ascending: true }) // composite-PK order → stable paging
      .range(from, from + PG - 1);
    if (error) throw error;
    const rows = (data ?? []) as { day: string; views: number | null }[];
    all.push(...rows);
    if (rows.length < PG) return sumViewsByDay(all, days, today);
  }
  throw new Error("fetchViewSeries: exceeded 50-page runaway cap");
}
