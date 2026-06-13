"use client";
import { useEffect, useState } from "react";
import ArticleCardV2 from "./ArticleCardV2";
import { buildAffinity, rankForYou, type HistoryEntry } from "@/lib/affinity";
import type { ArticleCard } from "@/lib/types";

// "For You" — a personalized homepage strip. Builds a tag-affinity profile
// from the reader's local reading history (nothing is sent to the server; the
// candidate pool from /api/recommend is generic and param-less) and ranks the
// pool client-side. Mirrors ContinueReading: renders nothing until it has
// picks, so there's no cold-start layout shift or hydration mismatch.
const HIST_LS = "_lb_reading_history";
const SHOW = 6;

function getHistory(): Record<string, HistoryEntry> {
  try {
    return JSON.parse(localStorage.getItem(HIST_LS) || "{}");
  } catch {
    return {};
  }
}

export default function ForYou() {
  const [items, setItems] = useState<ArticleCard[]>([]);

  useEffect(() => {
    let cancelled = false;
    const history = getHistory();
    const affinity = buildAffinity(history);
    if (affinity.size === 0) return; // cold start — nothing to personalize on

    // Exclude anything the reader has already touched (covers both "read" and
    // the Continue Reading strip, whose selection is progress > 0 && !completed).
    const excludeSlugs = new Set<string>();
    for (const e of Object.values(history)) {
      if (e?.slug && ((e.progress || 0) > 0 || e.completed)) excludeSlugs.add(e.slug);
    }

    (async () => {
      try {
        const r = await fetch("/api/recommend");
        if (!r.ok) throw new Error(`recommend HTTP ${r.status}`);
        const { articles } = (await r.json()) as { articles: ArticleCard[] };
        const picks = rankForYou(articles || [], affinity, { excludeSlugs, n: SHOW });
        if (!cancelled) setItems(picks);
      } catch (e) {
        console.error("[ForYou]", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!items.length) return null;

  return (
    <section className="lb-foryou lb-reveal" aria-label="Recommended for you">
      <div className="lb-foryou-title">
        <i className="fa-solid fa-wand-magic-sparkles" aria-hidden="true" /> For You
      </div>
      <div className="lb-card-grid">
        {items.map((a, idx) => (
          <ArticleCardV2 key={a.id} a={a} idx={idx} />
        ))}
      </div>
    </section>
  );
}
