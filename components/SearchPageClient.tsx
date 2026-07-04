"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSearch, MIN_SEARCH_QUERY } from "@/lib/use-search";
import { queryTerms } from "@/lib/search";
import { highlight } from "@/lib/highlight";
import { CATEGORIES } from "@/lib/categories";
import { fmtDate } from "@/lib/format";

// Full search page: same /api/search backend as FeedSearch / the command
// palette, plus category narrowing (server-side), tag narrowing (client-side),
// URL-synced ?q=, and ↑/↓/Enter keyboard navigation over results.
export default function SearchPageClient() {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") || "");
  const [category, setCategory] = useState<string | null>(params.get("category"));
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const extraQuery = category ? `&category=${encodeURIComponent(category)}` : "";
  const { res, loading } = useSearch(q, { extraQuery });

  // Keep the URL shareable without triggering server navigations.
  useEffect(() => {
    const usp = new URLSearchParams();
    if (q.trim()) usp.set("q", q.trim());
    if (category) usp.set("category", category);
    const qs = usp.toString();
    window.history.replaceState(null, "", qs ? `/search?${qs}` : "/search");
  }, [q, category]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Reset the tag filter + keyboard cursor when the query/category changes,
  // and the cursor when fresh results arrive — during render, not in effects
  // (the sanctioned derived-state-reset pattern; avoids cascading renders).
  const searchKey = `${q}|${category ?? ""}`;
  const [prevSearchKey, setPrevSearchKey] = useState(searchKey);
  if (prevSearchKey !== searchKey) {
    setPrevSearchKey(searchKey);
    setTagFilter(null);
    setActiveIdx(-1);
  }
  const [prevRes, setPrevRes] = useState(res);
  if (prevRes !== res) {
    setPrevRes(res);
    setActiveIdx(-1);
  }

  const articles = useMemo(() => {
    const list = res?.articles ?? [];
    if (!tagFilter) return list;
    return list.filter((a) => a.tags.includes(tagFilter));
  }, [res, tagFilter]);

  const terms = useMemo(() => queryTerms(q), [q]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (articles.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, articles.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      router.push(`/p/${articles[activeIdx].slug}`);
    }
  }

  const showEmpty =
    !loading && q.trim().length >= MIN_SEARCH_QUERY && res && articles.length === 0;

  return (
    <div className="lb-search-page" onKeyDown={onKeyDown}>
      <div className="lb-search-wrap" style={{ marginTop: 0 }}>
        <i className="fa-solid fa-magnifying-glass lb-search-icon" aria-hidden="true" />
        <input
          ref={inputRef}
          className="lb-search-bar"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search articles and thoughts…"
          aria-label="Search query"
          autoComplete="off"
        />
        {loading && <span className="lb-search-spinner" aria-hidden="true" />}
      </div>

      <div className="lb-cat-filters" role="group" aria-label="Filter by category">
        <button
          type="button"
          className={"lb-cat-chip" + (category === null ? " active" : "")}
          aria-pressed={category === null}
          onClick={() => setCategory(null)}
        >
          All
        </button>
        {CATEGORIES.map((c) => (
          <button
            type="button"
            key={c.slug}
            className={"lb-cat-chip" + (category === c.label ? " active" : "")}
            aria-pressed={category === c.label}
            onClick={() => setCategory(category === c.label ? null : c.label)}
          >
            <i className={`fa-solid ${c.icon}`} aria-hidden="true" /> {c.label}
          </button>
        ))}
      </div>

      {(res?.tags?.length ?? 0) > 0 && (
        <div className="lb-tag-filters" role="group" aria-label="Narrow by topic">
          {res!.tags.map((t) => (
            <button
              type="button"
              key={t}
              className={"lb-tag-chip" + (tagFilter === t ? " active" : "")}
              aria-pressed={tagFilter === t}
              onClick={() => {
                setTagFilter(tagFilter === t ? null : t);
                setActiveIdx(-1);
              }}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      <div className="lb-search-results" role="list" aria-label="Search results">
        {articles.map((a, i) => (
          <Link
            key={a.slug}
            role="listitem"
            href={`/p/${a.slug}`}
            className={"lb-search-hit" + (i === activeIdx ? " active" : "")}
            onMouseEnter={() => setActiveIdx(i)}
          >
            <div className="lb-search-hit-title">{highlight(a.title, terms)}</div>
            {(a.snippet || a.excerpt) && (
              <p className="lb-search-hit-snippet">{highlight(a.snippet || a.excerpt, terms)}</p>
            )}
            <div className="lb-search-hit-meta">
              <span>{fmtDate(a.created_at)}</span>
              {a.views ? <span>👁 {a.views}</span> : null}
              {a.tags.slice(0, 3).map((t) => (
                <span key={t} className="lb-card-tag">
                  {t}
                </span>
              ))}
            </div>
          </Link>
        ))}

        {(res?.thoughts?.length ?? 0) > 0 && !tagFilter && (
          <>
            <div className="lb-search-section-label">THOUGHTS</div>
            {res!.thoughts.map((t) => (
              <Link key={t.id} href="/thoughts" className="lb-search-hit thought">
                <p className="lb-search-hit-snippet">{highlight(t.snippet, terms)}</p>
                <div className="lb-search-hit-meta">
                  <span>{fmtDate(t.created_at)}</span>
                </div>
              </Link>
            ))}
          </>
        )}

        {showEmpty && (
          <div className="lb-empty" role="status">
            <div className="lb-empty-icon">🔍</div>
            No results for “{q.trim()}”{category ? ` in ${category}` : ""}.
          </div>
        )}

        {q.trim().length < MIN_SEARCH_QUERY && (
          <p className="lb-search-hint">
            Type at least {MIN_SEARCH_QUERY} characters. Use ↑ ↓ and Enter to open a result.
          </p>
        )}
      </div>
    </div>
  );
}
