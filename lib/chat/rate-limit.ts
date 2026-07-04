// Pure rate-limit helpers for the chat route (app/api/chat). Kept here, free of
// Supabase/Next, so the decision logic is unit-testable (vitest covers lib/** only).

export interface RateLimits {
  allowed: boolean;
  daily_used?: number;
  daily_max?: number;
  weekly_used?: number;
  weekly_max?: number;
  monthly_used?: number;
  monthly_max?: number;
}

// Defaults advertised to the client when no usable decision came back.
export const DEFAULT_MAX = { daily: 25, weekly: 100, monthly: 300 } as const;

// Resolve the rate-limit decision from the check_chat_rate_limit() RPC result, which is
// either a single JSON object or a one-row array of { allowed, *_used, *_max }.
//
// FAIL OPEN unless we got a definitive decision: a backend hiccup (null/error), an empty
// result, or an unexpected shape (e.g. a row without a boolean `allowed`) must NOT 429 the
// whole chat. Only a working RPC that explicitly says allowed:false is honoured as a real
// limit. This is exactly the pair of failures that took the chat down: the route passed a
// p_user_id arg the DB function doesn't accept, so every call errored and — under the old
// fail-closed default — returned 429 on every message.
export function resolveLimits(rl: unknown): RateLimits {
  if (isDecision(rl)) {
    return (Array.isArray(rl) ? rl[0] : rl) as RateLimits;
  }
  return { allowed: true, daily_used: 0, weekly_used: 0, monthly_used: 0 };
}

/** True iff the RPC result carries a definitive decision (a row with a boolean
 *  `allowed`). Lets the route tell "explicitly allowed" apart from the silent
 *  fail-open fallback above, so the fallback can be logged when it happens. */
export function isDecision(rl: unknown): boolean {
  const row = Array.isArray(rl) ? rl[0] : rl;
  return !!row && typeof row === "object" && typeof (row as RateLimits).allowed === "boolean";
}

export function rateLimitHeaders(l: RateLimits): Record<string, string> {
  return {
    "X-RateLimit-Daily": String(l.daily_used || 0),
    "X-RateLimit-Daily-Max": String(l.daily_max || DEFAULT_MAX.daily),
    "X-RateLimit-Weekly": String(l.weekly_used || 0),
    "X-RateLimit-Weekly-Max": String(l.weekly_max || DEFAULT_MAX.weekly),
    "X-RateLimit-Monthly": String(l.monthly_used || 0),
    "X-RateLimit-Monthly-Max": String(l.monthly_max || DEFAULT_MAX.monthly),
  };
}
