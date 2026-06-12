import { createHash, timingSafeEqual } from "crypto";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Strict UUID shape check for tokens arriving from URLs/forms. */
export function isUuid(s: string | null | undefined): boolean {
  return !!s && UUID_RE.test(s);
}

/**
 * Constant-time string comparison for shared secrets. Hashing both sides
 * first equalizes lengths, so neither content nor length leaks via timing.
 */
export function timingSafeCompare(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const da = createHash("sha256").update(a).digest();
  const db = createHash("sha256").update(b).digest();
  return timingSafeEqual(da, db);
}
