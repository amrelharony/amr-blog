// Deploy-time env sanity report, surfaced by instrumentation.ts at server
// boot. Most integrations here are deliberately fail-open (a missing key
// silently disables the feature at runtime), which makes a forgotten Vercel
// env var invisible until a user notices — this check puts it in the boot
// logs instead. NEVER throws: CI and local builds run with no Supabase env,
// and a report must not become an outage.

/** Vars the app cannot meaningfully run without (queries throw at request time). */
export const REQUIRED_CORE = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SITE_URL",
] as const;

/** Vars whose absence silently degrades one feature (each code path fails open). */
export const FEATURE_VARS: Record<string, readonly string[]> = {
  ingest: ["ARTICLES_API_KEY", "SUPABASE_SERVICE_ROLE_KEY"],
  chat: ["OPENCLAW_API_KEY"],
  email: ["RESEND_API_KEY"],
  crons: ["CRON_SECRET"],
  embeddings: ["EMBED_FN_URL", "EMBED_FN_SECRET"],
  newsletterAdmin: ["NEWSLETTER_ADMIN_SECRET"],
  revalidate: ["REVALIDATE_SECRET"],
};

export interface EnvReport {
  /** Required core vars that are absent. */
  missing: string[];
  /** Features silently disabled by absent vars. */
  degraded: { feature: string; missing: string[] }[];
}

export function checkEnv(env: Record<string, string | undefined> = process.env): EnvReport {
  const missing = REQUIRED_CORE.filter((k) => !env[k]);
  const degraded: EnvReport["degraded"] = [];
  for (const [feature, vars] of Object.entries(FEATURE_VARS)) {
    const miss = vars.filter((k) => !env[k]);
    if (miss.length) degraded.push({ feature, missing: miss });
  }
  return { missing, degraded };
}
