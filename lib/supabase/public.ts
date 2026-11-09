// Anon, cookie-less Supabase client for PUBLIC reads in Server Components.
// Deliberately NOT the @supabase/ssr cookie client: touching cookies would force
// dynamic rendering and defeat SSG/ISR. RLS limits anon to published rows.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// A public read that gets no response within 8 s gives up: the same bound
// /api/db-keepalive uses. When Supabase sat behind Cloudflare 522s (2026-11-05
// and -08), reads with no timeout held 2 GB Fluid instances open for 20-165 s per
// render. A 500 is never cached, so every crawler retry paid again: $1.00 of
// provisioned memory in one morning. Now a hung read fails after 8 s, and ISR
// keeps serving the last good page where it has one.
//
// This uses postgrest's own `db.timeout`, not a fetch wrapper around
// AbortSignal.timeout(). postgrest-js retries GETs 3 times (1/2/4 s backoff)
// unless the error is an AbortError. A wrapper's TimeoutError got retried, which
// meant 4 requests and ~39 s per read. db.timeout aborts with an AbortError, so a
// hung read is one attempt. Limits: the timer stops once response headers arrive,
// so a body that stalls mid-stream isn't covered. postgrest still retries 503/520
// responses and fast network errors, each try getting its own 8 s.
//
// `next build` prerenders every article in parallel, and a slow read there used
// to finish late rather than fail the deploy, so the build gets a longer bound.
export const PUBLIC_READ_TIMEOUT_MS =
  process.env.NEXT_PHASE === "phase-production-build" ? 30_000 : 8_000;

export function createPublicClient(timeoutMs: number = PUBLIC_READ_TIMEOUT_MS) {
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { timeout: timeoutMs },
  });
}
