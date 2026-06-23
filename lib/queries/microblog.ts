import { createPublicClient } from "@/lib/supabase/public";
import { sanitizeSearchQuery } from "@/lib/search";
import type { Thought } from "@/lib/types";

// Published thoughts (pinned first, newest next). RLS limits anon to
// published=true AND (scheduled_at IS NULL OR scheduled_at <= now()).
export async function getThoughts(limit = 15, offset = 0): Promise<Thought[]> {
  const sb = createPublicClient();
  const { data, error } = await sb
    .from("microblog")
    .select("*")
    // Defense-in-depth: mirror the RLS predicate in the app layer so /thoughts
    // doesn't depend on RLS alone (longform reads gate on .eq("published") too).
    .eq("published", true)
    .or(`scheduled_at.is.null,scheduled_at.lte.${new Date().toISOString()}`)
    .order("pinned", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return (data ?? []) as Thought[];
}

/**
 * Full-text search over thought bodies (websearch syntax, implicit
 * to_tsvector on the text column — no schema changes). RLS scopes anon to
 * published, non-scheduled rows, same as getThoughts.
 */
export async function searchThoughts(q: string, limit = 6): Promise<Thought[]> {
  q = sanitizeSearchQuery(q);
  if (!q) return [];
  const sb = createPublicClient();
  const { data, error } = await sb
    .from("microblog")
    .select("*")
    .eq("published", true)
    .or(`scheduled_at.is.null,scheduled_at.lte.${new Date().toISOString()}`)
    .textSearch("content", q, { type: "websearch" })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Thought[];
}
