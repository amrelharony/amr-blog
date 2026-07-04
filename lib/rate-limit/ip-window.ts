// In-memory per-IP fixed-window rate limiting for cheap public GET routes
// (/api/search, /api/feed). Deliberately NOT the DB-backed RPC the chat route
// uses: chat spends OpenClaw money per request and needs a durable cross-
// instance cap, while search/feed are CDN-fronted reads — a DB write per
// request would add latency to every cache miss and hand attackers a DB-load
// amplifier. Per-instance counters on Vercel are an accepted limitation: a
// cache-busting flood is still blunted within each warm instance at zero cost.

interface WindowEntry {
  windowStart: number;
  count: number;
}

const SWEEP_THRESHOLD = 10_000; // sweep expired entries when the map grows past this

export interface IpWindow {
  check(key: string, now?: number): { allowed: boolean; retryAfterSec: number };
}

export function createIpWindow(opts: { limit: number; windowMs: number }): IpWindow {
  const { limit, windowMs } = opts;
  const hits = new Map<string, WindowEntry>();

  return {
    check(key: string, now: number = Date.now()) {
      // Fail open on a missing key — never block traffic we can't attribute.
      if (!key) return { allowed: true, retryAfterSec: 0 };
      const cur = hits.get(key);
      if (!cur || now - cur.windowStart >= windowMs) {
        if (hits.size >= SWEEP_THRESHOLD) {
          for (const [k, v] of hits) {
            if (now - v.windowStart >= windowMs) hits.delete(k);
          }
        }
        hits.set(key, { windowStart: now, count: 1 });
        return { allowed: true, retryAfterSec: 0 };
      }
      cur.count++;
      if (cur.count > limit) {
        return {
          allowed: false,
          retryAfterSec: Math.max(1, Math.ceil((cur.windowStart + windowMs - now) / 1000)),
        };
      }
      return { allowed: true, retryAfterSec: 0 };
    },
  };
}

/** Client IP as set by the Vercel edge: x-real-ip is not client-spoofable there,
 *  with x-forwarded-for's first hop as the fallback. Empty string when unknown. */
export function clientIpFrom(headers: Headers): string {
  return (
    (headers.get("x-real-ip") || "").trim() ||
    (headers.get("x-forwarded-for") || "").split(",")[0].trim()
  );
}
