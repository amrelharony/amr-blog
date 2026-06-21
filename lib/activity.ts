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
    await sb.from("activity_log").insert({
      action,
      entity_type: entityType,
      entity_id: entityId || null,
      summary: summary.slice(0, 300),
    });
  } catch {
    /* swallow — logging is non-critical */
  }
}
