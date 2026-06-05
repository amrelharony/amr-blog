"use client";
import { useEffect } from "react";

// Wires the homepage search box and the "All" chip to filter the server-rendered
// article cards in place. The feed (hero + cards) is static server markup, so —
// like FeedAnimations / ArticleReader — this client layer enhances the existing
// DOM rather than re-rendering it. Tag chips are real <Link>s and navigate away.
export default function FeedSearch() {
  useEffect(() => {
    const input = document.querySelector<HTMLInputElement>(".lb-search-bar");
    const grid = document.querySelector<HTMLElement>("#lbGrid");
    if (!input || !grid) return;

    const hero = grid.querySelector<HTMLElement>(".lb-hero");
    const cards = Array.from(grid.querySelectorAll<HTMLElement>(".lb-card-v2"));
    const items = [hero, ...cards].filter((el): el is HTMLElement => !!el);
    const allChip = document.querySelector<HTMLButtonElement>('.lb-tag-chip[data-filter="all"]');

    let empty: HTMLElement | null = null;
    const apply = () => {
      const q = input.value.trim().toLowerCase();
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
          empty.innerHTML = '<div class="lb-empty-icon">🔍</div>No articles match your search.';
          grid.appendChild(empty);
        }
      } else if (empty) {
        empty.remove();
        empty = null;
      }
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
      for (const el of items) el.style.display = "";
    };
  }, []);

  return null;
}
