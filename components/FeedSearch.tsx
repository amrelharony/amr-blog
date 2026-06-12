"use client";
import { useEffect, useRef, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/browser";
import ArticleCardV2 from "@/components/ArticleCardV2";
import type { ArticleCard } from "@/lib/types";
import { CARD_COLUMNS } from "@/lib/queries/articles";

// Wires the homepage search box and the "All" chip. Cards already on the page
// (server-rendered first page + any load-more pages) are filtered in place,
// like FeedAnimations / ArticleReader this layer enhances the existing DOM.
// Because the feed is now paginated, DOM filtering alone would only search the
// loaded cards — so queries also hit Supabase (title/excerpt/tags ilike across
// ALL published articles) and matches not already on the page render below.
export default function FeedSearch() {
  const [query, setQuery] = useState("");
  const [serverHits, setServerHits] = useState<ArticleCard[]>([]);
  const debounceRef = useRef<number>(0);

  // DOM filtering of loaded cards + grid "searching" state.
  useEffect(() => {
    const input = document.querySelector<HTMLInputElement>(".lb-search-bar");
    const grid = document.querySelector<HTMLElement>("#lbGrid");
    if (!input || !grid) return;

    const allChip = document.querySelector<HTMLButtonElement>('.lb-tag-chip[data-filter="all"]');

    let empty: HTMLElement | null = null;
    const apply = () => {
      const q = input.value.trim().toLowerCase();
      // Re-query on every keystroke — load-more appends cards after mount.
      const items = Array.from(grid.querySelectorAll<HTMLElement>(".lb-hero, .lb-card-v2"));
      grid.classList.toggle("lb-searching", !!q);
      let shown = 0;
      for (const el of items) {
        const match = !q || (el.textContent || "").toLowerCase().includes(q);
        el.style.display = match ? "" : "none";
        if (match) shown++;
      }
      if (q && shown === 0) {
        if (!empty) {
          empty = document.createElement("div");
          empty.className = "lb-empty";
          empty.setAttribute("role", "status");
          empty.innerHTML = '<div class="lb-empty-icon">🔍</div>No loaded articles match — searching the archive…';
          grid.appendChild(empty);
        }
      } else if (empty) {
        empty.remove();
        empty = null;
      }
      setQuery(q);
    };

    const onInput = () => apply();
    const onAll = (e: Event) => {
      e.preventDefault();
      input.value = "";
      apply();
      input.focus();
    };
    input.addEventListener("input", onInput);
    allChip?.addEventListener("click", onAll);

    return () => {
      input.removeEventListener("input", onInput);
      allChip?.removeEventListener("click", onAll);
      empty?.remove();
      grid.classList.remove("lb-searching");
      for (const el of Array.from(grid.querySelectorAll<HTMLElement>(".lb-hero, .lb-card-v2"))) {
        el.style.display = "";
      }
    };
  }, []);

  // Debounced archive search for matches that aren't loaded on the page.
  useEffect(() => {
    window.clearTimeout(debounceRef.current);
    if (query.length < 2) {
      setServerHits([]);
      return;
    }
    debounceRef.current = window.setTimeout(async () => {
      try {
        // PostgREST `or` args are comma/paren-delimited — strip both from the
        // pattern so user input can't break the filter expression.
        const safe = query.replace(/[%,()]/g, " ").trim();
        if (!safe) return;
        const { data } = await getBrowserClient()
          .from("longform_articles")
          .select(CARD_COLUMNS)
          .eq("published", true)
          .or(`title.ilike.*${safe}*,excerpt.ilike.*${safe}*`)
          .order("created_at", { ascending: false })
          .limit(12);
        const onPage = new Set(
          Array.from(document.querySelectorAll<HTMLElement>("#lbGrid [data-id]")).map(
            (el) => el.dataset.id,
          ),
        );
        setServerHits(((data ?? []) as ArticleCard[]).filter((a) => !onPage.has(a.id)));
      } catch {
        setServerHits([]);
      }
    }, 300);
    return () => window.clearTimeout(debounceRef.current);
  }, [query]);

  if (!query || serverHits.length === 0) return null;
  return (
    <section aria-label="More results from the archive">
      <div className="lb-search-results-label">FROM THE ARCHIVE</div>
      <div className="lb-card-grid">
        {serverHits.map((a) => (
          <ArticleCardV2 key={a.id} a={a} reveal={false} />
        ))}
      </div>
    </section>
  );
}
