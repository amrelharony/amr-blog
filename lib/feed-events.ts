"use client";
// Typed window-event contract between the feed's DOM-enhancing clients:
// FeedSearch (dispatches searching), FeedLoadMore (dispatches more, listens
// for searching), FeedAnimations (listens for more). Keeping names and detail
// shapes here prevents the string contract from drifting.

const SEARCHING = "feed:searching";
const MORE = "feed:more";

/** A search is active (server panel or degraded filter) — hide load-more. */
export function dispatchFeedSearching(active: boolean) {
  window.dispatchEvent(new CustomEvent(SEARCHING, { detail: { active } }));
}

export function onFeedSearching(handler: (active: boolean) => void): () => void {
  const listener = (e: Event) =>
    handler(!!(e as CustomEvent<{ active?: boolean }>).detail?.active);
  window.addEventListener(SEARCHING, listener);
  return () => window.removeEventListener(SEARCHING, listener);
}

/** New cards were appended to the grid — re-run reveals on them. */
export function dispatchFeedMore() {
  window.dispatchEvent(new CustomEvent(MORE));
}

export function onFeedMore(handler: () => void): () => void {
  window.addEventListener(MORE, handler);
  return () => window.removeEventListener(MORE, handler);
}
