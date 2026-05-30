"use client";
import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/browser";
import { relTime } from "@/lib/microblog-format";

// "Continue Reading" strip — ported from renderContinueReading in blog-reader-data.js.
// Reads in-progress articles from localStorage (merged with cloud reading_history) and
// shows them above the feed.
const LS = "_lb_reading_history";
interface Entry {
  articleId: string;
  slug?: string;
  title?: string;
  cover_image?: string;
  last_read_at: string;
  progress: number;
  completed?: boolean;
}
function get(): Record<string, Omit<Entry, "articleId">> {
  try {
    return JSON.parse(localStorage.getItem(LS) || "{}");
  } catch {
    return {};
  }
}
function set(v: unknown) {
  try {
    localStorage.setItem(LS, JSON.stringify(v));
  } catch {}
}

export default function ContinueReading() {
  const [items, setItems] = useState<Entry[]>([]);

  useEffect(() => {
    let cancelled = false;
    const build = () => {
      const h = get();
      const arr = Object.keys(h)
        .map((id) => ({ articleId: id, ...h[id] }))
        .filter((e) => e.progress > 0 && !e.completed && e.slug)
        .sort((a, b) => new Date(b.last_read_at).getTime() - new Date(a.last_read_at).getTime())
        .slice(0, 8);
      if (!cancelled) setItems(arr);
    };
    build();

    (async () => {
      try {
        const sb = getBrowserClient();
        const { data } = await sb
          .from("reading_history")
          .select("article_id,last_read_at,progress,time_spent,completed")
          .order("last_read_at", { ascending: false })
          .limit(50);
        const rows = (data || []) as {
          article_id: string;
          last_read_at: string;
          progress: number;
          completed: boolean;
        }[];
        if (!rows.length) return;
        const local = get();
        const missing = rows.filter((r) => !local[r.article_id]).map((r) => r.article_id);
        const meta: Record<string, { slug: string; title: string; cover_image: string }> = {};
        if (missing.length) {
          const { data: arts } = await sb.from("longform_articles").select("id,slug,title,cover_image").in("id", missing);
          (arts || []).forEach((a: { id: string; slug: string; title: string; cover_image: string }) => {
            meta[a.id] = { slug: a.slug, title: a.title, cover_image: a.cover_image };
          });
        }
        rows.forEach((r) => {
          const le = local[r.article_id];
          if (!le) {
            const m = meta[r.article_id];
            if (m) local[r.article_id] = { ...r, ...m };
          } else {
            le.progress = Math.max(le.progress || 0, r.progress || 0);
            le.completed = le.completed || r.completed;
            if (new Date(r.last_read_at) > new Date(le.last_read_at || 0)) le.last_read_at = r.last_read_at;
          }
        });
        set(local);
        build();
      } catch {
        /* offline / no session — local only */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!items.length) return null;

  const remove = (id: string) => {
    const h = get();
    delete h[id];
    set(h);
    setItems((prev) => prev.filter((i) => i.articleId !== id));
  };

  return (
    <div className="lb-continue lb-reveal" id="lbContinue">
      <div className="lb-continue-title">
        <i className="fa-solid fa-clock-rotate-left" /> Continue Reading
      </div>
      <div className="lb-continue-scroll">
        {items.map((item) => (
          <div
            key={item.articleId}
            className="lb-continue-card"
            onClick={() => {
              window.location.href = `/p/${item.slug}`;
            }}
          >
            {item.cover_image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="lb-continue-img" src={item.cover_image} alt={item.title || ""} loading="lazy" />
            ) : (
              <div className="lb-continue-fallback">
                <i className="fa-solid fa-feather-pointed" />
              </div>
            )}
            <button
              className="lb-continue-close"
              title="Remove"
              aria-label="Remove from continue reading"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                remove(item.articleId);
              }}
            >
              ×
            </button>
            <div className="lb-continue-body">
              <div className="lb-continue-card-title">{item.title}</div>
              <div className="lb-continue-card-time">{relTime(item.last_read_at)}</div>
              <div className="lb-continue-progress">
                <div className="lb-continue-progress-fill" style={{ width: Math.round(item.progress) + "%" }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
