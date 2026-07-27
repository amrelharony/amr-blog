// Activity-log querying for the admin activity page and its CSV export route.
// URL-driven filters (action / entity_type / UTC date range / page) are parsed
// and sanitized here so the page and the export route apply identical logic.
// Uses the caller's AUTHENTICATED client — activity_log RLS admits the admin
// session (0006) — never the service role.
import type { SupabaseClient } from "@supabase/supabase-js";

export const ACTIVITY_PAGE_SIZE = 50;

export interface ActivityRow {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  summary: string | null;
  created_at: string;
}

export interface ActivityFilters {
  action: string; // "" = any
  entity: string; // "" = any
  from: string; // YYYY-MM-DD (UTC) or ""
  to: string; // YYYY-MM-DD (UTC, inclusive) or ""
  page: number; // 1-based
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function first(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

/** Regex-shaped AND a real calendar date — the regex alone admits 2026-13-01 / 2026-02-31,
 *  which then blow up nextUtcDay (new Date(NaN).toISOString() → RangeError) or reach
 *  PostgREST as an invalid timestamp. The ISO round-trip rejects both NaN and month/day
 *  rollover. */
function isValidDay(s: string): boolean {
  if (!DAY_RE.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
}

// Upper bound on ?page=. Without one, Number() happily yields 1e20 or Infinity, and
// the resulting offset serializes into the PostgREST Range header as "5e+21"/"Infinity"
// — a parse error, NOT the PGRST103 that fetchActivityPage catches, so the "show an
// empty page instead of a crash" guard was bypassed and /admin/activity 500'd. A
// million pages is far past any real activity_log and keeps the arithmetic exact.
const MAX_ACTIVITY_PAGE = 1_000_000;

function clampPage(raw: string): number {
  const n = Math.floor(Number(raw));
  if (!Number.isSafeInteger(n) || n < 1) return 1;
  return Math.min(n, MAX_ACTIVITY_PAGE);
}

/** Sanitize searchParams: malformed dates are dropped, page clamps to 1…1e6. */
export function parseActivityFilters(
  sp: Record<string, string | string[] | undefined>,
): ActivityFilters {
  const from = first(sp.from);
  const to = first(sp.to);
  return {
    action: first(sp.action).slice(0, 64),
    entity: first(sp.entity).slice(0, 64),
    from: isValidDay(from) ? from : "",
    to: isValidDay(to) ? to : "",
    page: clampPage(first(sp.page)),
  };
}

/** Query string ("" or "?…") for links that preserve filters; page 1 is implicit. */
export function activityQueryString(f: ActivityFilters, page?: number): string {
  const p = new URLSearchParams();
  if (f.action) p.set("action", f.action);
  if (f.entity) p.set("entity", f.entity);
  if (f.from) p.set("from", f.from);
  if (f.to) p.set("to", f.to);
  const pg = page ?? f.page;
  if (pg > 1) p.set("page", String(pg));
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Day after `day` (YYYY-MM-DD), for the exclusive upper bound of the range. */
function nextUtcDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

// The builder methods used here all mutate-and-return the same builder. A
// minimal structural view (via unknown) sidesteps TS2589 — constraining a
// generic against Supabase's deeply-parameterised PostgrestFilterBuilder blows
// the instantiation depth — while staying reusable across select() variants.
interface FilterableQuery {
  eq(col: string, val: string): FilterableQuery;
  gte(col: string, val: string): FilterableQuery;
  lt(col: string, val: string): FilterableQuery;
}

function applyFilters<Q>(query: Q, f: ActivityFilters): Q {
  let q = query as unknown as FilterableQuery;
  if (f.action) q = q.eq("action", f.action);
  if (f.entity) q = q.eq("entity_type", f.entity);
  if (f.from) q = q.gte("created_at", `${f.from}T00:00:00Z`);
  if (f.to) q = q.lt("created_at", `${nextUtcDay(f.to)}T00:00:00Z`);
  return q as unknown as Q;
}

export interface ActivityPage {
  rows: ActivityRow[];
  count: number; // exact total across the whole filtered set
}

export async function fetchActivityPage(
  sb: SupabaseClient,
  f: ActivityFilters,
): Promise<ActivityPage> {
  const offset = (f.page - 1) * ACTIVITY_PAGE_SIZE;
  const { data, error, count } = await applyFilters(
    sb.from("activity_log").select("*", { count: "exact" }),
    f,
  )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false }) // stable tiebreaker so paging can't skip/dupe
    .range(offset, offset + ACTIVITY_PAGE_SIZE - 1);
  // A hand-edited ?page= beyond the result set makes PostgREST reject the
  // Range header (PGRST103) — show an empty page instead of a crash.
  if (error) {
    if (error.code === "PGRST103") return { rows: [], count: 0 };
    throw error;
  }
  return { rows: (data ?? []) as ActivityRow[], count: count ?? 0 };
}

/**
 * Distinct action / entity_type values for the filter dropdowns. PostgREST has
 * no DISTINCT, so page the two columns and dedupe incrementally (single-admin
 * log — typically one request). Capped; throws on error (callers fail open).
 */
export async function fetchActivityFacets(
  sb: SupabaseClient,
): Promise<{ actions: string[]; entities: string[] }> {
  const actions = new Set<string>();
  const entities = new Set<string>();
  for (let page = 0; page < 10; page++) {
    const from = page * 1000;
    const { data, error } = await sb
      .from("activity_log")
      .select("action,entity_type")
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    const rows = (data ?? []) as { action: string | null; entity_type: string | null }[];
    for (const r of rows) {
      if (r.action) actions.add(r.action);
      if (r.entity_type) entities.add(r.entity_type);
    }
    if (rows.length < 1000) break;
  }
  return { actions: [...actions].sort(), entities: [...entities].sort() };
}

/** Hard ceiling on export size (pages of 1000). Reaching it truncates rather than fails. */
export const ACTIVITY_EXPORT_MAX_PAGES = 20;

/**
 * Filtered set for CSV export, paged past the 1000-row cap.
 *
 * On hitting the page ceiling this returns what it has (with `truncated: true`)
 * instead of throwing. `activity_log` grows unbounded — nothing prunes it, unlike the
 * 60-day `article_view_daily` sweep in /api/db-keepalive — so throwing turned the
 * export from "works" into "permanently 500s" the moment the log crossed 20k rows.
 * Rows come back newest-first, so a truncated export keeps the most recent window,
 * which is the part an operator is actually after.
 */
export async function fetchAllActivityRows(
  sb: SupabaseClient,
  f: ActivityFilters,
): Promise<{ rows: ActivityRow[]; truncated: boolean }> {
  const all: ActivityRow[] = [];
  for (let page = 0; page < ACTIVITY_EXPORT_MAX_PAGES; page++) {
    const from = page * 1000;
    const { data, error } = await applyFilters(
      sb.from("activity_log").select("id,action,entity_type,entity_id,summary,created_at"),
      f,
    )
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + 999);
    if (error) throw error;
    const rows = (data ?? []) as ActivityRow[];
    all.push(...rows);
    if (rows.length < 1000) return { rows: all, truncated: false };
  }
  return { rows: all, truncated: true };
}
