"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ArticleCardV2 from "./ArticleCardV2";
import { dispatchFeedMore, onFeedSearching } from "@/lib/feed-events";
import type { ArticleCard } from "@/lib/types";

// Infinite-scroll pagination for the feed (mirrors ThoughtsFeed.loadMore).
// Fetches the next page from /api/feed and portals the new cards into the
// existing server-rendered .lb-card-grid so the grid flows as one. An
// IntersectionObserver on the sentinel auto-loads as it nears the viewport;
// the "[ LOAD MORE ]" button stays as a keyboard/no-observer fallback. Rendered
// inside #lbGrid, so FeedSearch hiding the grid hides this too; the
// feed:searching listener additionally hides the control during the degraded
// DOM-filter search, where the grid stays visible.
interface FeedPage {
  articles: ArticleCard[];
  hasMore: boolean;
}

export default function FeedLoadMore({
  initialSlugs,
  hasMore: initialHasMore,
  category,
  tag,
}: {
  initialSlugs: string[];
  hasMore: boolean;
  /** When set, pages are filtered to this category (e.g. on /category/[slug]). */
  category?: string;
  /** When set, pages are filtered to this tag (e.g. on /tag/[tag]). */
  tag?: string;
}) {
  const [extra, setExtra] = useState<ArticleCard[]>([]);
  const [offset, setOffset] = useState(initialSlugs.length);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [gridHost, setGridHost] = useState<HTMLElement | null>(null);
  // Every slug already rendered (server page + appends), for de-duping.
  const seen = useRef(new Set(initialSlugs));
  // Infinite-scroll sentinel + a ref to the latest loadMore (so a stable
  // observer always calls the current closure).
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<() => void>(() => {});
  // Synchronous in-flight guard: the `loading` state is async, so the sentinel observer
  // and a button click firing in the same tick both pass the state check and each advance
  // the offset - skipping a whole page. A ref blocks the second call immediately.
  const loadingRef = useRef(false);
  // How many appended cards FeedAnimations has already been told about.
  const announced = useRef(0);

  // Reset when the feed identity changes. The App Router reuses this instance across
  // /category/a -> /category/b and /tag/x -> /tag/y (same route file, only the dynamic
  // segment differs) - the same hazard ArticleReader/TtsButton/ArticleEngagement key
  // their effects on `slug` for. Without this the new feed inherited the previous
  // one's pagination: the old page-2 cards stayed portalled into the grid, `offset`
  // still pointed past them so the new feed's next page was skipped, `seen` suppressed
  // any shared slug, and a previous hasMore===false hid Load More entirely.
  // Adjusting state during render (React's documented prop-change pattern) rather than
  // in an effect avoids committing one frame of the stale list.
  const feedKey = `${category ?? ""} ${tag ?? ""}`;
  const [prevFeedKey, setPrevFeedKey] = useState(feedKey);
  if (prevFeedKey !== feedKey) {
    setPrevFeedKey(feedKey);
    setExtra([]);
    setOffset(initialSlugs.length);
    setHasMore(initialHasMore);
    setLoading(false);
  }

  // The rest of the reset. Refs must NOT be written during render (React can discard
  // a render, and the write wouldn't roll back), so the non-visual bookkeeping lands
  // here — effects run after commit and before any click or observer callback can
  // fire, so loadMore never sees the previous feed's values.
  // Also re-queries the portal host: the server renders a fresh .lb-card-grid for the
  // new segment, so a node captured on the previous page is detached and appended
  // cards would render into nothing.
  useEffect(() => {
    seen.current = new Set(initialSlugs);
    announced.current = 0;
    loadingRef.current = false;
    setGridHost(document.querySelector<HTMLElement>("#lbGrid .lb-card-grid"));
    // initialSlugs is a fresh array on every render; feedKey is the real trigger, and
    // re-running on identity alone would wipe `seen` after each append.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedKey]);

  useEffect(() => onFeedSearching(setSearching), []);

  // After new cards are committed to the DOM, let FeedAnimations re-run its
  // reveals - appended .lb-reveal cards stay at opacity 0 otherwise.
  useEffect(() => {
    if (extra.length > announced.current) {
      announced.current = extra.length;
      dispatchFeedMore();
    }
  }, [extra.length]);

  const loadMore = async () => {
    if (loadingRef.current || !hasMore || searching) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const r = await fetch(
        `/api/feed?offset=${offset}` +
          (category ? `&category=${encodeURIComponent(category)}` : "") +
          (tag ? `&tag=${encodeURIComponent(tag)}` : ""),
      );
      if (!r.ok) throw new Error(`feed HTTP ${r.status}`);
      const data = (await r.json()) as FeedPage;
      // De-dupe by slug: offset paging over a newest-first, mutable list can
      // re-surface a row when posts land between ISR snapshots.
      const fresh = data.articles.filter((a) => !seen.current.has(a.slug));
      fresh.forEach((a) => seen.current.add(a.slug));
      setExtra((x) => [...x, ...fresh]);
      setOffset((o) => o + data.articles.length);
      setHasMore(data.hasMore);
    } catch (e) {
      console.error("[FeedLoadMore]", e);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  };
  // Keep the ref pointing at the latest loadMore (refs can't be written during
  // render), so the stable observer always invokes the current closure.
  useEffect(() => {
    loadMoreRef.current = loadMore;
  });

  // Auto-load as the sentinel nears the viewport. Re-created after each append
  // (extra.length) and on hasMore/searching changes, so a sentinel that is
  // still on screen keeps filling the page; loadMore self-guards against
  // concurrent or exhausted loads and against the active search state.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || searching) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMoreRef.current();
      },
      { rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, searching, extra.length]);

  const cards = extra.map((a, i) => <ArticleCardV2 key={a.id} a={a} idx={i} />);
  return (
    <>
      {extra.length > 0 &&
        (gridHost ? (
          createPortal(cards, gridHost)
        ) : (
          <div className="lb-card-grid">{cards}</div>
        ))}
      {hasMore && !searching && (
        <div ref={sentinelRef} className="lb-feed-sentinel">
          <button className="lb-load-more" onClick={loadMore} disabled={loading}>
            {loading ? "[ LOADING… ]" : "[ LOAD MORE ]"}
          </button>
        </div>
      )}
    </>
  );
}
