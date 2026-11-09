// On-demand revalidation for a known set of article pages (/p/<slug>).
//
// Article pages keep a render for an hour (app/p/[slug]/page.tsx), so a bulk
// publish, unpublish or delete in the admin list has to mark the affected pages
// stale itself. Otherwise an unpublished or deleted article stays readable, or a
// just-published one stays a cached 404, for up to that hour. The list sends the
// slugs of the selected rows (one page of at most 50; the selection is cleared on
// every page or filter change).
import { revalidatePath } from "next/cache";

/** Upper bound on slugs per call: two admin list pages' worth. */
export const MAX_REVALIDATE_SLUGS = 100;

// lib/format.ts slugify output (plus the hex suffix a collision adds) is
// [a-z0-9-]. Accept upper case too for older imported rows. Anything else isn't
// one of our slugs: skip it rather than build an odd cache key from it.
const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,199}$/;

/** The /p/<slug> paths to revalidate. Ignores junk, dedupes and caps the count. */
export function articlePagePaths(slugs: readonly unknown[]): string[] {
  const seen = new Set<string>();
  for (const raw of slugs) {
    if (seen.size >= MAX_REVALIDATE_SLUGS) break;
    if (typeof raw !== "string" || !SLUG_RE.test(raw)) continue;
    seen.add(raw);
  }
  return [...seen].map((s) => `/p/${s}`);
}

/** Mark these article pages stale; each regenerates on its next visit. */
export function revalidateArticlePages(slugs: readonly unknown[]): void {
  for (const path of articlePagePaths(slugs)) revalidatePath(path);
}
