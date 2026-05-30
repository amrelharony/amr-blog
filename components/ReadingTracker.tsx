"use client";
import { useEffect } from "react";
import { getBrowserClient } from "@/lib/supabase/browser";
import { ensureAnonSession } from "@/lib/supabase/anon";

// Reading-history tracker — ported from Js/blog-reader-data.js. Tracks scroll
// progress + time on an article, persists to localStorage (_lb_reading_history),
// and syncs to the cloud (upsert_reading_progress RPC) every 15s + on exit.
const LS = "_lb_reading_history";
function get(): Record<string, ReadingEntry> {
  try {
    return JSON.parse(localStorage.getItem(LS) || "{}");
  } catch {
    return {};
  }
}
function set(v: Record<string, ReadingEntry>) {
  try {
    localStorage.setItem(LS, JSON.stringify(v));
  } catch {
    // prune to 30 most-recent on quota error
    try {
      const entries = Object.entries(v).sort(
        (a, b) => new Date(b[1].last_read_at || 0).getTime() - new Date(a[1].last_read_at || 0).getTime(),
      );
      localStorage.setItem(LS, JSON.stringify(Object.fromEntries(entries.slice(0, 30))));
    } catch {}
  }
}
interface ReadingEntry {
  slug?: string;
  title?: string;
  cover_image?: string;
  last_read_at: string;
  time_spent: number;
  progress: number;
  completed: boolean;
}

export default function ReadingTracker({
  articleId,
  slug,
  title,
  coverImage,
}: {
  articleId: string;
  slug: string;
  title: string;
  coverImage: string;
}) {
  useEffect(() => {
    const sb = getBrowserClient();
    let timeSpent = 0;
    let progress = 0;
    const h = get();
    const existing = h[articleId];
    if (existing) {
      timeSpent = existing.time_spent || 0;
      progress = existing.progress || 0;
    }
    h[articleId] = {
      ...(existing || {}),
      slug,
      title,
      cover_image: coverImage || "",
      last_read_at: new Date().toISOString(),
      time_spent: timeSpent,
      progress,
      completed: (existing && existing.completed) || false,
    };
    set(h);

    const curProgress = () => {
      const el = document.querySelector(".lb-article");
      if (!el || !window.innerHeight) return 0;
      const r = el.getBoundingClientRect();
      const scrolled = Math.max(0, -r.top);
      const total = Math.max(1, r.height - window.innerHeight);
      return Math.max(0, Math.min(100, Math.round((scrolled / total) * 100)));
    };

    const tick = setInterval(() => {
      if (document.hidden) return;
      timeSpent++;
      progress = curProgress();
      const hh = get();
      if (hh[articleId]) {
        hh[articleId].time_spent = timeSpent;
        hh[articleId].progress = Math.max(hh[articleId].progress || 0, progress);
        if (progress >= 95) hh[articleId].completed = true;
        hh[articleId].last_read_at = new Date().toISOString();
        set(hh);
      }
    }, 1000);

    const sync = async () => {
      await ensureAnonSession();
      const e = get()[articleId];
      if (!e) return;
      sb.rpc("upsert_reading_progress", {
        p_article_id: articleId,
        p_progress: e.progress || 0,
        p_time_spent: e.time_spent || 0,
        p_completed: e.completed || false,
      }).then(
        () => {},
        () => {},
      );
    };
    const syncTimer = setInterval(sync, 15000);

    return () => {
      clearInterval(tick);
      clearInterval(syncTimer);
      const hh = get();
      if (hh[articleId]) {
        const p = curProgress();
        hh[articleId].progress = Math.max(hh[articleId].progress || 0, p);
        hh[articleId].time_spent = timeSpent;
        if (p >= 95) hh[articleId].completed = true;
        set(hh);
      }
      sync();
    };
  }, [articleId, slug, title, coverImage]);

  return null;
}
