import { describe, expect, it } from "vitest";
import { resolveLimits, rateLimitHeaders } from "./rate-limit";

// Regression guard for the chat "message limit on every message" bug: the route called
// check_chat_rate_limit with a p_user_id arg the DB function doesn't accept, so the RPC
// errored (rl == null) and the old fail-closed default returned 429 every time. The fix
// fails OPEN unless the RPC returns an explicit decision.
describe("resolveLimits", () => {
  it("fails open when the RPC errored (null) — the bug that 429'd every message", () => {
    expect(resolveLimits(null).allowed).toBe(true);
    expect(resolveLimits(undefined).allowed).toBe(true);
  });

  it("fails open on an empty array (no row)", () => {
    expect(resolveLimits([]).allowed).toBe(true);
  });

  it("fails open on an unexpected shape (row missing a boolean `allowed`)", () => {
    // e.g. a stale/foreign RPC contract returning only counters.
    expect(resolveLimits({ daily_used: 3 }).allowed).toBe(true);
    expect(resolveLimits(true).allowed).toBe(true);
    expect(resolveLimits("nope").allowed).toBe(true);
  });

  it("honours a real allowed:false from a working RPC (limit still enforced)", () => {
    expect(resolveLimits({ allowed: false, daily_used: 25, daily_max: 25 }).allowed).toBe(false);
  });

  it("passes through a single-object result and its counters", () => {
    const r = resolveLimits({ allowed: true, daily_used: 5, daily_max: 25 });
    expect(r.allowed).toBe(true);
    expect(r.daily_used).toBe(5);
  });

  it("unwraps a one-row array result", () => {
    const r = resolveLimits([{ allowed: false, weekly_used: 100, weekly_max: 100 }]);
    expect(r.allowed).toBe(false);
    expect(r.weekly_used).toBe(100);
  });
});

describe("rateLimitHeaders", () => {
  it("emits all six counters from the limits object", () => {
    const h = rateLimitHeaders({
      allowed: true,
      daily_used: 5,
      daily_max: 25,
      weekly_used: 10,
      weekly_max: 100,
      monthly_used: 20,
      monthly_max: 300,
    });
    expect(h["X-RateLimit-Daily"]).toBe("5");
    expect(h["X-RateLimit-Daily-Max"]).toBe("25");
    expect(h["X-RateLimit-Monthly"]).toBe("20");
  });

  it("falls back to default maxes when the limits object omits them", () => {
    const h = rateLimitHeaders({ allowed: true });
    expect(h["X-RateLimit-Daily"]).toBe("0");
    expect(h["X-RateLimit-Daily-Max"]).toBe("25");
    expect(h["X-RateLimit-Weekly-Max"]).toBe("100");
    expect(h["X-RateLimit-Monthly-Max"]).toBe("300");
  });
});
