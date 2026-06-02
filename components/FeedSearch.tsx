"use client";
import { useEffect } from "react";

// Wires the (server-rendered) feed search box + "All" chip to live-filter the article
// cards. The original blog filtered loaded cards in JS; the standalone feed is
// server-rendered, so this island operates on that DOM (same pattern as ArticleReader /
// RevealOnScroll). Purely additive: it only shows/hides cards, never mutates content.
export default function FeedSearch() {
  useEffect(() => {
    const input = document.querySelector<HTMLInputElement>(".lb-search-bar");
    const grid = document.getElementById("lbGrid");
    if (!input || !grid) return;

    const hero = grid.querySelector<HTMLElement>(".lb-hero");
    const cards = Array.from(grid.querySelectorAll<HTMLElement>(".lb-card-v2"));
    if (!hero && cards.length === 0) return;

    // "No results" message (created lazily, reuses the existing empty-state styling).
    let empty: HTMLDivElement | null = null;
    const setEmpty = (term: string, show: boolean) => {
      if (show) {
        if (!empty) {
          empty = document.createElement("div");
          empty.className = "lb-empty";
          empty.setAttribute("role", "status");
          grid.appendChild(empty);
        }
        empty.textContent = `No articles match “${term}”.`;
        empty.style.display = "";
      } else if (empty) {
        empty.style.display = "none";
      }
    };

    const apply = () => {
      const term = input.value.trim().toLowerCase();
      const matches = (el: HTMLElement) => !term || (el.textContent || "").toLowerCase().includes(term);
      let shown = 0;
      if (hero) {
        const m = matches(hero);
        hero.style.display = m ? "" : "none";
        if (m) shown++;
      }
      for (const c of cards) {
        const m = matches(c);
        c.style.display = m ? "" : "none";
        if (m) shown++;
      }
      setEmpty(input.value.trim(), term.length > 0 && shown === 0);
    };

    const onInput = () => apply();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        input.value = "";
        apply();
      }
    };
    input.addEventListener("input", onInput);
    input.addEventListener("keydown", onKey);

    // The "All" chip clears the active filter/search (other chips are real tag links).
    const allChip = document.querySelector<HTMLElement>('.lb-tag-chip[data-filter="all"]');
    const onAll = () => {
      input.value = "";
      apply();
    };
    allChip?.addEventListener("click", onAll);

    return () => {
      input.removeEventListener("input", onInput);
      input.removeEventListener("keydown", onKey);
      allChip?.removeEventListener("click", onAll);
      empty?.remove();
    };
  }, []);

  return null;
}
