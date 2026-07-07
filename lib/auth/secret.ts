// Constant-time shared-secret comparison for the secret-authed routes (cron
// triggers, ISR revalidation, the ingest API). Extracted from the ingest key
// check so every caller uses one hardened implementation instead of a
// timing-leaky `===`.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

// Random per-boot stand-in, hashed whenever either side is absent, so every
// call does identical hash+compare work and response timing can't reveal
// whether the secret is even configured.
const DUMMY = randomBytes(32).toString("hex");

/**
 * True iff `presented` equals `expected` in constant time. Both sides are
 * hashed first so length never leaks and timingSafeEqual (which throws on a
 * length mismatch) always gets equal-length buffers. Returns false when the
 * expected secret is unset or the presented value is null, so callers that gate
 * on it stay fail-closed on misconfiguration.
 */
export function secretMatches(presented: string | null, expected: string | undefined): boolean {
  const a = createHash("sha256").update(presented ?? DUMMY).digest();
  const b = createHash("sha256").update(expected || DUMMY).digest();
  return timingSafeEqual(a, b) && !!expected && presented !== null;
}

/** Extract the token from an `Authorization: Bearer <token>` header, or null. */
export function bearerToken(authHeader: string | null): string | null {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  return authHeader.slice("Bearer ".length);
}
