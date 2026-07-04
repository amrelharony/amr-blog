// Next.js instrumentation hook: register() runs once per server boot, before
// requests are served. Used only for the warn-only env sanity report — most
// integrations fail open when their env var is missing, so a forgotten Vercel
// var is otherwise invisible until a feature silently stops working. Must
// never throw: a missing var is a degraded feature, not an outage.
import { checkEnv } from "@/lib/env";
import { logEvent } from "@/lib/log";

export function register() {
  const { missing, degraded } = checkEnv();
  if (missing.length) logEvent("env.check.missing_core", { vars: missing });
  for (const d of degraded) {
    logEvent("env.check.feature_degraded", { feature: d.feature, missing: d.missing });
  }
}
