"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { fmtDate } from "@/lib/format";
import { highlight } from "@/lib/highlight";
import { dispatchFeedSearching } from "@/lib/feed-events";
import { queryTerms } from "@/lib/search";
import { MIN_SEARCH_QUERY, useSearch } from "@/lib/use-search";

// Wires the homepage search box to the /api/search full-text endpoint. The
// feed (hero + cards) is static server markup, so — like FeedAnimations /
// ArticleReader — this client layer enhances the existing DOM: it hides
// #lbGrid while a server search is active and portals a results panel in
// after the search bar. If the endpoint is unreachable it degrades to the
// original in-place DOM filter over the rendered cards.
export default function FeedSearch() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [wrap, setWrap] = useState<HTMLElement | null>(null);
  const [q, setQ] = useState("");
  const [fallback, setFallback] = useState(false);
  const composing = useRef(false);

  const onSearchError = useCallback((e: unknown) => {
    console.error("[FeedSearch] server search failed, using client filter:", e);
    setFallback(true);
  }, []);
  const { res, loading, abort } = useSearch(q, { enabled: !fallback, onError: onSearchError });

  const active = !fallback && q.trim().length >= MIN_SEARCH_QUERY;

  // Attach to the server-rendered input and create the results host node.
  useEffect(() => {
    const input = document.querySelector<HTMLInputElement>(".lb-search-bar");
    const wrapEl = document.querySelector<HTMLElement>(".lb-search-wrap");
    const grid = document.querySelector<HTMLElement>("#lbGrid");
    if (!input || !wrapEl || !grid) return;

    const hostEl = document.createElement("div");
    hostEl.className = "lb-search-results-host";
    wrapEl.insertAdjacentElement("afterend", hostEl);
    setHost(hostEl);
    setWrap(wrapEl);

    const onInput = () => {
      if (!composing.current) setQ(input.value);
    };
    const onCompStart = () => {
      composing.current = true;
    };
    const onCompEnd = () => {
      composing.current = false;
      setQ(input.value);
    };
    const allChip = document.querySelector<HTMLButtonElement>('.lb-tag-chip[data-filter="all"]');
    const onAll = (e: Event) => {
      e.preventDefault();
      input.value = "";
      setQ("");
      input.focus();
    };

    input.addEventListener("input", onInput);
    input.addEventListener("compositionstart", onCompStart);
    input.addEventListener("compositionend", onCompEnd);
    allChip?.addEventListener("click", onAll);
    return () => {
      input.removeEventListener("input", onInput);
      input.removeEventListener("compositionstart", onCompStart);
      input.removeEventListener("compositionend", onCompEnd);
      allChip?.removeEventListener("click", onAll);
      hostEl.remove();
    };
  }, []);

  // Hide the static grid while server results are shown.
  useEffect(() => {
    const grid = document.querySelector<HTMLElement>("#lbGrid");
    if (!grid) return;
    grid.style.display = active ? "none" : "";
    return () => {
      grid.style.display = "";
    };
  }, [active]);

  // Tell FeedLoadMore a search is underway — in either mode. (In server mode
  // the hidden grid hides the button anyway; in fallback mode the grid stays
  // visible, so the button hides itself on this event.)
  const querying = q.trim().length >= MIN_SEARCH_QUERY;
  useEffect(() => {
    dispatchFeedSearching(querying);
    return () => dispatchFeedSearching(false);
  }, [querying]);

  // Degraded path: the original in-place DOM filter. Items are re-collected
  // on every keystroke so cards appended by FeedLoadMore are covered too.
  useEffect(() => {
    if (!fallback) return;
    const grid = document.querySelector<HTMLElement>("#lbGrid");
    if (!grid) return;
    const query = q.trim().toLowerCase();
    const items = Array.from(grid.querySelectorAll<HTMLElement>(".lb-hero, .lb-card-v2"));
    let shown = 0;
    for (const el of items) {
      const match = !query || (el.textContent || "").toLowerCase().includes(query);
      el.style.display = match ? "" : "none";
      if (match) shown++;
    }
    let empty = grid.querySelector<HTMLElement>(".lb-search-empty");
    if (query && shown === 0) {
      if (!empty) {
        empty = document.createElement("div");
        empty.className = "lb-empty lb-search-empty";
        empty.setAttribute("role", "status");
        empty.innerHTML = '<div class="lb-empty-icon">🔍</div>No articles match your search.';
        grid.appendChild(empty);
      }
    } else {
      empty?.remove();
    }
    return () => {
      for (const el of items) el.style.display = "";
      grid.querySelector(".lb-search-empty")?.remove();
    };
  }, [fallback, q]);

  const clear = () => {
    const input = document.querySelector<HTMLInputElement>(".lb-search-bar");
    if (input) {
      input.value = "";
      input.focus();
    }
    abort();
    setQ("");
  };

  const terms = useMemo(() => queryTerms(q.trim()), [q]);
  const noHits =
    res && res.articles.length === 0 && res.thoughts.length === 0 && res.tags.length === 0;

  return (
    <>
      {wrap &&
        q.length > 0 &&
        createPortal(
          <button className="lb-search-clear" onClick={clear} aria-label="Clear search">
            CLEAR
          </button>,
          wrap,
        )}
      {host &&
        active &&
        createPortal(
          <div className="lb-search-results" role="region" aria-label="Search results" aria-live="polite">
            {loading && !res && <div className="lb-sr-status">SEARCHING…</div>}
            {res && res.articles.length > 0 && (
              <div className="lb-sr-group">
                <div className="lb-sr-label">ARTICLES</div>
                {res.articles.map((a) => (
                  <Link key={a.slug} className="lb-search-result" href={`/p/${a.slug}`}>
                    <div className="lb-sr-title">{highlight(a.title, terms)}</div>
                    {(a.snippet || a.excerpt) && (
                      <div className="lb-sr-snippet">{highlight(a.snippet || a.excerpt, terms)}</div>
                    )}
                    <div className="lb-sr-meta">
                      <span>{fmtDate(a.created_at)}</span>
                      <span>👁 {a.views}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
            {res && res.thoughts.length > 0 && (
              <div className="lb-sr-group">
                <div className="lb-sr-label">THOUGHTS</div>
                {res.thoughts.map((t) => (
                  <Link key={t.id} className="lb-search-result" href="/thoughts">
                    <div className="lb-sr-snippet">{highlight(t.snippet, terms)}</div>
                    <div className="lb-sr-meta">
                      <span>{fmtDate(t.created_at)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
            {res && res.tags.length > 0 && (
              <div className="lb-sr-group">
                <div className="lb-sr-label">TAGS</div>
                <div className="lb-sr-tags">
                  {res.tags.map((t) => (
                    <Link key={t} className="lb-tag-chip" href={`/tag/${encodeURIComponent(t)}`}>
                      {t}
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {noHits && (
              <div className="lb-empty" role="status">
                <div className="lb-empty-icon">🔍</div>
                Nothing matches your search.
              </div>
            )}
          </div>,
          host,
        )}
    </>
  );
}
