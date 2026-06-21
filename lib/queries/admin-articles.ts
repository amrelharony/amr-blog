// Admin-side article listing: paginated, searchable, and status/category
// filtered. Unlike lib/queries/articles.ts (anon public client, published-only),
// this runs through the caller's AUTHENTICATED browser client so the admin sees
// drafts and scheduled posts too (RLS "Admin full access").
//
// Critically, this uses .range() + an exact count so it works past PostgREST's
// ~1000-row response cap — the old un-ranged select silently returned only the
// newest 1000 of ~2900 articles, hiding the rest from the editor entirely.
import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizeSearchQuery } from "@/lib/search";

export const ADMIN_PAGE_SIZE = 50;

/** Sentinel category filter value meaning "category IS NULL" (drives backfill). */
export const UNCATEGORIZED = "__uncat__";

export type AdminStatus = "all" | "published" | "draft" | "scheduled";

export interface AdminArticleRow {
  id: string;
  title: string;
  slug: string;
  published: boolean;
  scheduled_at: string | null;
  created_at: string;
  category: string | null;
}

export interface AdminListParams {
  page: number; // 0-based
  q: string;
  status: AdminStatus;
  category: string; // "" = any, a CATEGORY label, or UNCATEGORIZED
}

export interface AdminListResult {
  rows: AdminArticleRow[];
  count: number; // exact total across the whole filtered set (not just this page)
}

const COLS = "id,title,slug,published,scheduled_at,created_at,category";

/**
 * Page through the admin article library. Status is derived from the
 * (published, scheduled_at) pair — the same model the editor's three save modes
 * write: published=true → Live; published=false & scheduled_at set → Scheduled;
 * published=false & scheduled_at null → Draft.
 */
export async function listAdminArticles(
  sb: SupabaseClient,
  params: AdminListParams,
): Promise<AdminListResult> {
  const offset = Math.max(0, params.page) * ADMIN_PAGE_SIZE;
  let query = sb
    .from("longform_articles")
    .select(COLS, { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false }) // stable tiebreaker so paging can't skip/dupe
    .range(offset, offset + ADMIN_PAGE_SIZE - 1);

  if (params.status === "published") query = query.eq("published", true);
  else if (params.status === "draft") query = query.eq("published", false).is("scheduled_at", null);
  else if (params.status === "scheduled")
    query = query.eq("published", false).not("scheduled_at", "is", null);

  if (params.category === UNCATEGORIZED) query = query.is("category", null);
  else if (params.category) query = query.eq("category", params.category);

  const q = sanitizeSearchQuery(params.q || "");
  if (q) query = query.or(`title.wfts.${q},excerpt.wfts.${q},content.wfts.${q}`);

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: (data ?? []) as AdminArticleRow[], count: count ?? 0 };
}

/**
 * True if `slug` is already used by a different article — checked SERVER-SIDE so
 * it is immune to the 1000-row cap (the in-memory isSlugTaken() only sees the
 * current page). Returns false on error to avoid blocking a save on a transient
 * lookup failure (the DB unique constraint remains the hard backstop).
 */
export async function slugTakenServer(
  sb: SupabaseClient,
  slug: string,
  currentId: string,
): Promise<boolean> {
  const s = slug.trim().toLowerCase();
  if (!s) return false;
  let query = sb.from("longform_articles").select("id").eq("slug", s).limit(1);
  if (currentId) query = query.neq("id", currentId);
  const { data, error } = await query.maybeSingle();
  if (error) return false;
  return !!data;
}
