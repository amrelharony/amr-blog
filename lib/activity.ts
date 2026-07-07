import type { SupabaseClient } from "@supabase/supabase-js";

// Best-effort admin activity logging. Never throws / never blocks the mutation
// it records — a logging failure must not break a publish or delete. Inserts run
// under the admin session (activity_log RLS is gated to ADMIN_UUID).
export async function logActivity(
  sb: SupabaseClient,
  action: string,
  entityType: string | null,
  entityId: string | null,
  summary: string,
): Promise<void> {
  try {
    // supabase-js does NOT throw on PostgREST/RLS errors — check the returned
    // error too, so a silently-broken audit trail (e.g. an insert-policy
    // regression) is at least visible in logs. Still never throws.
    const { error } = await sb.from("activity_log").insert({
      action,
      entity_type: entityType,
      entity_id: entityId || null,
      summary: summary.slice(0, 300),
    });
    if (error) console.warn("[activity] insert failed:", error.message);
  } catch (e) {
    console.warn("[activity] insert threw:", e instanceof Error ? e.message : e);
  }
}
