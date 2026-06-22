// Service-role Supabase client for trusted server-side writes that run WITHOUT a
// user session (e.g. the token-authed POST /api/articles ingest endpoint).
//
// The anon clients (public.ts / server.ts / browser.ts) are RLS-bound and can
// only read published rows — they cannot insert. The admin SECURITY DEFINER RPCs
// require auth.uid() = ADMIN_UUID, which a session-less request can't satisfy.
// So a session-less writer needs the service-role key, which bypasses RLS.
//
// NEVER import this from client/browser code and NEVER log the key.
import { createClient } from "@supabase/supabase-js";

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase service client not configured (missing URL or SUPABASE_SERVICE_ROLE_KEY)");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
