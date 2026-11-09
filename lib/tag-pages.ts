// On-demand revalidation for the per-tag surfaces (/tag/<tag> and /feed/tag/<tag>).
//
// Tag pages are cached for a long time (see app/tag/[tag]/page.tsx), so every code
// path that publishes, edits, retags or removes an article has to invalidate the
// tag pages it touched. Otherwise a new article stays off its tag pages until the
// cache expires or the next deploy.
//
// The literal path passed to revalidatePath must match the cache key Next derived
// when it rendered the page, and the raw tag often doesn't:
//   * Pages are keyed by the DECODED path with path delimiters re-escaped
//     (route-module.js: decodePathParams → escapePathDelimiters), so "tcp/ip" is
//     keyed "/tag/tcp%2Fip". The old revalidatePath(`/tag/${t}`) missed it.
//   * When Vercel hands the page a still-encoded param (lib/route-param.ts), the
//     entry is keyed by the ENCODED tag, e.g. "/tag/ai%20productivity".
//   * Route handlers (/feed/tag) take their implicit tag from req.nextUrl.pathname,
//     the encoded request path.
// So we revalidate each form a tag can be keyed under. revalidatePath only marks a
// key stale and regeneration waits for the next visit, so a form that was never
// cached costs nothing.
import { revalidatePath } from "next/cache";
import { MAX_TAG_PARAM } from "@/lib/route-param";

/** Upper bound on tags per call: ingest allows 20, an admin save sends old ∪ new. */
export const MAX_REVALIDATE_TAGS = 50;

/** Mirrors next/dist/shared/lib/router/utils/escape-path-delimiters. */
function escapePathDelimiters(segment: string, escapeEncoded: boolean): string {
  const re = escapeEncoded ? /([/#?]|%(2f|23|3f|5c))/gi : /([/#?])/g;
  return segment.replace(re, (c) => encodeURIComponent(c));
}

/** Every cache-key form a tag can be stored under (deduped; usually 1 or 2). */
export function tagKeyForms(tag: string): string[] {
  const encoded = encodeURIComponent(tag);
  return [
    ...new Set([
      escapePathDelimiters(tag, false), // decoded param (the normal page key)
      escapePathDelimiters(encoded, true), // still-encoded param, page key
      encoded, // route handler key (encoded request pathname)
    ]),
  ];
}

/** The literal paths to revalidate for these tags. Ignores junk and caps the count. */
export function tagPagePaths(tags: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const paths: string[] = [];
  for (const raw of tags) {
    if (typeof raw !== "string") continue;
    const tag = raw.trim();
    if (!tag || tag.length > MAX_TAG_PARAM || seen.has(tag)) continue;
    if (seen.size >= MAX_REVALIDATE_TAGS) break;
    seen.add(tag);
    for (const key of tagKeyForms(tag)) {
      paths.push(`/tag/${key}`, `/feed/tag/${key}`);
    }
  }
  return paths;
}

/** Mark the tag pages and tag feeds for these tags stale. */
export function revalidateTagPages(tags: readonly unknown[]): void {
  for (const path of tagPagePaths(tags)) revalidatePath(path);
}

/**
 * Mark EVERY tag page and tag feed stale. Each one then regenerates on its next
 * visit, so with ~9,300 tags this costs about what a deploy does. Reserve it for
 * bulk admin operations whose tags aren't known client-side.
 */
export function revalidateAllTagPages(): void {
  revalidatePath("/tag/[tag]", "page");
  // Route handlers carry a "<route>/layout" derived tag, not "<route>/page".
  revalidatePath("/feed/tag/[tag]", "layout");
}
