// Pure client-side list filtering/sorting for the admin lists (no DOM, no
// Supabase) so it stays unit-testable and reusable across every admin page.

/** Case-insensitive substring match; empty/whitespace query matches everything. */
export function textMatch(haystack: string, q: string): boolean {
  const query = q.trim().toLowerCase();
  if (!query) return true;
  return (haystack || "").toLowerCase().includes(query);
}

export interface FilterSortOpts<T> {
  query?: string;
  /** Text fields of an item to search across. */
  fields?: (item: T) => Array<string | null | undefined>;
  /** "all" (or empty) disables status filtering. */
  status?: string;
  statusOf?: (item: T) => string;
  /** Key into `comparators`. */
  sort?: string;
  comparators?: Record<string, (a: T, b: T) => number>;
}

/** Filter by query + status, then sort. Never mutates `items`. */
export function filterSort<T>(items: T[], opts: FilterSortOpts<T> = {}): T[] {
  const { query = "", fields, status, statusOf, sort, comparators } = opts;
  let out = items;
  if (query.trim() && fields) {
    out = out.filter((it) => fields(it).some((f) => textMatch(f || "", query)));
  }
  if (status && status !== "all" && statusOf) {
    out = out.filter((it) => statusOf(it) === status);
  }
  if (sort && comparators && comparators[sort]) {
    out = [...out].sort(comparators[sort]);
  }
  return out;
}

/** Publish status shared by articles and thoughts (live/scheduled/draft). */
export function pubStatus(x: { published?: boolean; scheduled_at?: string | null }): "live" | "sched" | "draft" {
  if (x.published) return "live";
  if (x.scheduled_at) return "sched";
  return "draft";
}
