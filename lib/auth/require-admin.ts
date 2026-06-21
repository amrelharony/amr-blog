// Server-side admin auth helpers, shared by API route handlers and Server
// Component pages so the `auth.uid() === ADMIN_UUID` check lives in exactly one
// place (was duplicated inline in proxy.ts, /api/revalidate, /api/admin/summarize).
//   - isAdminUser(): boolean — for route handlers that return 401 themselves.
//   - requireAdmin(): redirects unauthenticated/non-admin callers to login — a
//     defense-in-depth backstop for Server pages behind the proxy guard.
// (Server-only in practice: it imports next/headers via createClient and
// next/navigation's redirect, neither of which resolves in client bundles.)
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminId } from "@/lib/auth/is-admin";

/** Server-validates the session JWT and returns whether it is the admin user. */
export async function isAdminUser(): Promise<boolean> {
  try {
    const sb = await createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    return isAdminId(user?.id);
  } catch {
    return false;
  }
}

/** Server Component guard: redirect to the login page unless the caller is admin. */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdminUser())) redirect("/admin/login");
}
