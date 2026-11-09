// Free-form dynamic segments (/tag/[tag], /feed/tag/[tag], /series/[name]) must
// reach the query fully decoded. Next decodes `params` itself, but on Vercel a value
// can still arrive percent-encoded (Next's own decodeQueryPathParameter says as
// much: "When deployed to Vercel, the value may be encoded"). Production showed it:
// /tag/bitcoin%20halving returned 200 on some requests and 404 on others, because
// some renders saw tag === "bitcoin%20halving", matched no rows and called
// notFound(). That variant even gets its own ISR cache key, so the 404 stuck.
//
// The encoded render also emitted canonical /tag/bitcoin%2520halving (encoding the
// already-encoded value), which crawlers then followed, so a value can arrive
// encoded more than once. We decode until it stops changing, capped at 3 rounds,
// the same bound Next uses for its own param matching.
//
// Ambiguity: a stored value containing a literal "%XX" escape would be decoded too.
// No tag or series name does (0 of 9,298 tags in Nov 2026 contain "%"), and a "%"
// not followed by two hex digits (e.g. "100%") is left alone.

const PCT_ESCAPE = /%[0-9A-Fa-f]{2}/;
const MAX_ROUNDS = 3;

/** Decode a dynamic route param that may arrive percent-encoded (possibly twice). */
export function decodeRouteParam(raw: string): string {
  let value = raw;
  for (let i = 0; i < MAX_ROUNDS && PCT_ESCAPE.test(value); i++) {
    try {
      value = decodeURIComponent(value);
    } catch {
      break; // malformed sequence (e.g. "%E0%A4%A"): keep what we have
    }
  }
  return value;
}

/**
 * Longest tag a /tag or /feed/tag URL may name. Stored tags are capped at 50 by the
 * ingest API (the longest today is 32); 100 matches /api/feed's tag bound. Longer
 * values 404 without touching the database.
 */
export const MAX_TAG_PARAM = 100;
