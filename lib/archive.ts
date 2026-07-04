// Pure aggregation helpers for the discovery pages (/archive, /tags, /series) —
// no Supabase, fully unit-testable. The paged fetches live in lib/queries/articles.ts.

export interface ArchiveRow {
  slug: string;
  title: string;
  created_at: string;
}

export interface YearGroup {
  year: number;
  count: number;
}

/** Publication years with counts, newest first. Rows with unparseable dates are dropped. */
export function groupByYear(rows: { created_at: string }[]): YearGroup[] {
  const counts = new Map<number, number>();
  for (const r of rows) {
    const y = new Date(r.created_at).getUTCFullYear();
    if (!Number.isFinite(y)) continue;
    counts.set(y, (counts.get(y) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([year, count]) => ({ year, count }))
    .sort((a, b) => b.year - a.year);
}

/** The rows published in a given year, newest first. */
export function articlesInYear<T extends { created_at: string }>(rows: T[], year: number): T[] {
  return rows
    .filter((r) => new Date(r.created_at).getUTCFullYear() === year)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export interface TagCount {
  tag: string;
  count: number;
}

/**
 * Tag frequencies across articles, by count desc then name. Tags are counted
 * by exact stored value (the corpus normalizes casing at ingest).
 */
export function tagCounts(rows: { tags: string[] | null }[]): TagCount[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    for (const t of r.tags || []) {
      if (!t) continue;
      counts.set(t, (counts.get(t) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** Chip font-size weight (px) for the /tags cloud: log-scaled between bounds. */
export function tagWeight(count: number, max: number, minPx = 12, maxPx = 26): number {
  if (max <= 1 || count <= 0) return minPx;
  const norm = Math.log(count + 1) / Math.log(max + 1);
  return Math.round(minPx + (maxPx - minPx) * Math.min(1, norm));
}

export interface SeriesSummary {
  name: string;
  count: number;
  latest: string; // ISO date of the most recent part
}

/** Distinct series with part counts, most recently updated first. */
export function seriesIndex(rows: { series_name: string | null; created_at: string }[]): SeriesSummary[] {
  const map = new Map<string, SeriesSummary>();
  for (const r of rows) {
    const name = (r.series_name || "").trim();
    if (!name) continue;
    const cur = map.get(name);
    if (!cur) map.set(name, { name, count: 1, latest: r.created_at });
    else {
      cur.count += 1;
      if (r.created_at > cur.latest) cur.latest = r.created_at;
    }
  }
  return [...map.values()].sort((a, b) => b.latest.localeCompare(a.latest));
}
