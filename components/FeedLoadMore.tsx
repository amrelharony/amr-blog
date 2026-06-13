"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ArticleCardV2 from "./ArticleCardV2";
import type { ArticleCard } from "@/lib/types";

// "[ LOAD MORE ]" pagination for the feed (mirrors ThoughtsFeed.loadMore).
// Fetches the next page from /api/feed and portals the new cards into the
// existing server-rendered .lb-card-grid so the grid flows as one. Rendered
// inside #lbGrid, so FeedSearch hiding the grid hides this too; the
// feed:searching listener additionally hides the button during the degraded
// DOM-filter search, where the grid stays visible.
interface FeedPage {
  articles: ArticleCard[];
  hasMore: boolean;
}

export default function FeedLoadMore({
  initialCount,
  hasMore: initialHasMore,
}: {
  initialCount: number;
  hasMore: boolean;
}) {
  const [extra, setExtra] = useState<ArticleCard[]>([]);
  const [offset, setOffset] = useState(initialCount);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [gridHost, setGridHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setGridHost(document.querySelector<HTMLElement>("#lbGrid .lb-card-grid"));
    const onSearching = (e: Event) =>
      setSearching(!!(e as CustomEvent<{ active?: boolean }>).detail?.active);
    window.addEventListener("feed:searching", onSearching);
    return () => window.removeEventListener("feed:searching", onSearching);
  }, []);

  // After new cards are committed to the DOM, let FeedAnimations re-run its
  // reveals — appended .lb-reveal cards stay at opacity 0 otherwise.
  const announced = useRef(0);
  useEffect(() => {
    if (extra.length > announced.current) {
      announced.current = extra.length;
      window.dispatchEvent(new CustomEvent("feed:more"));
    }
  }, [extra.length]);

  const loadMore = async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/feed?offset=${offset}`);
      if (!r.ok) throw new Error(`feed HTTP ${r.status}`);
      const data = (await r.json()) as FeedPage;
      // De-dupe by slug against everything already in the grid (server cards
      // + earlier appends): offset paging over a newest-first, mutable list
      // can re-surface a row when posts land between ISR snapshots.
      const seen = new Set(
        Array.from(document.querySelectorAll('#lbGrid a[href^="/p/"]')).map((el) =>
          decodeURIComponent((el.getAttribute("href") || "").slice("/p/".length)),
        ),
      );
      const fresh = data.articles.filter((a) => !seen.has(a.slug));
      setExtra((x) => [...x, ...fresh]);
      setOffset((o) => o + data.articles.length);
      setHasMore(data.hasMore);
    } catch (e) {
      console.error("[FeedLoadMore]", e);
    } finally {
      setLoading(false);
    }
  };

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
        <button className="lb-load-more" onClick={loadMore} disabled={loading}>
          {loading ? "[ LOADING… ]" : "[ LOAD MORE ]"}
        </button>
      )}
    </>
  );
}
