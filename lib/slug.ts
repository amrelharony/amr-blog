// Pure slug helpers for the admin editor (unit-testable, no DOM).

/** True if `slug` is already used by a different article in the list. */
export function isSlugTaken(
  slug: string,
  currentId: string,
  items: { id: string; slug: string }[],
): boolean {
  const s = slug.trim().toLowerCase();
  if (!s) return false;
  return items.some((a) => (a.slug || "").toLowerCase() === s && a.id !== currentId);
}
