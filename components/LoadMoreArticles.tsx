"use client";
import { useState } from "react";
import { getBrowserClient } from "@/lib/supabase/browser";
import ArticleCardV2 from "@/components/ArticleCardV2";
import type { ArticleCard } from "@/lib/types";
import { CARD_COLUMNS, FEED_PAGE_SIZE } from "@/lib/queries/articles";

// "Load more" pagination for the homepage feed. The first page is server-
// rendered (static under ISR); further pages are fetched directly from
// Supabase in the browser — RLS already allows anonymous reads of published
// rows, the same access the server's public client uses.
export default function LoadMoreArticles({ initialCount }: { initialCount: number }) {
  const [extra, setExtra] = useState<ArticleCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialCount >= FEED_PAGE_SIZE);

  const loadMore = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const offset = initialCount + extra.length;
      const { data, error } = await getBrowserClient()
        .from("longform_articles")
        .select(CARD_COLUMNS)
        .eq("published", true)
        .order("created_at", { ascending: false })
        .range(offset, offset + FEED_PAGE_SIZE - 1);
      if (error) throw error;
      const rows = (data ?? []) as ArticleCard[];
      // Skip anything already on the page (offsets shift if a post was
      // published after the ISR snapshot rendered the first page).
      const seen = new Set(
        Array.from(document.querySelectorAll<HTMLElement>("#lbGrid [data-id]")).map(
          (el) => el.dataset.id,
        ),
      );
      setExtra((prev) => [...prev, ...rows.filter((r) => !seen.has(r.id))]);
      setHasMore(rows.length >= FEED_PAGE_SIZE);
    } catch {
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  };

  if (extra.length === 0 && !hasMore) return null;
  return (
    <>
      {extra.length > 0 && (
        <div className="lb-card-grid">
          {extra.map((a) => (
            <ArticleCardV2 key={a.id} a={a} reveal={false} />
          ))}
        </div>
      )}
      {hasMore && (
        <div className="lb-load-more-wrap">
          <button className="lb-load-more" type="button" onClick={loadMore} disabled={loading}>
            {loading ? "LOADING…" : "[ LOAD MORE ]"}
          </button>
        </div>
      )}
    </>
  );
}
