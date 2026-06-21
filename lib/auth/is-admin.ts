// Pure admin-identity predicate — the single source of truth for "is this the
// admin user?" Kept free of next/headers and next/navigation imports so it is
// safe to use from proxy.ts (the edge guard), route handlers, and server pages
// alike. The async session-backed helpers live in lib/auth/require-admin.ts.
import { ADMIN_UUID } from "@/lib/constants";

/** True iff `id` is the single admin Supabase Auth user (matches the RLS UUID). */
export function isAdminId(id: string | null | undefined): boolean {
  return !!id && id === ADMIN_UUID;
}
