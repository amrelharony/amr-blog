// Anon, cookie-less Supabase client for PUBLIC reads in Server Components.
// Deliberately NOT the @supabase/ssr cookie client: touching cookies would force
// dynamic rendering and defeat SSG/ISR. RLS limits anon to published rows.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export function createPublicClient() {
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
