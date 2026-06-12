import { createHash, timingSafeEqual } from "crypto";

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
