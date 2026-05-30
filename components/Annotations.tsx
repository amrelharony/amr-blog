"use client";
import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/browser";
import { ensureAnonSession } from "@/lib/supabase/anon";

// Highlights & annotations — ported from Js/blog-reader-data.js. Select text in the
// article to highlight (4 colors) + add a note; persisted to localStorage
// (_lb_annotations) with best-effort cloud sync (reader_annotations / upsert_annotation).
const LS = "_lb_annotations";
const COLORS = ["yellow", "blue", "green", "pink"] as const;

interface Ann {
  id: string;
  cloudId?: string;
  text: string;
  note: string | null;
  color: string;
  start: number;
  end: number;
  created_at: string;
}

function getAll(): Record<string, Ann[]> {
  try {
    return JSON.parse(localStorage.getItem(LS) || "{}");
  } catch {
    return {};
  }
}
function setAll(v: Record<string, Ann[]>) {
  try {
    localStorage.setItem(LS, JSON.stringify(v));
  } catch {}
}
function genId() {
  return "local_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
}

// ── offset <-> range (ported _getTextOffset / _findRangeFromOffsets) ──
function textOffset(container: Node, node: Node, off: number): number {
  const w = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
  let o = 0;
  let n: Node | null;
  while ((n = w.nextNode())) {
    if (n === node) return o + Math.min(off, (n.textContent || "").length);
    o += (n.textContent || "").length;
  }
  return o;
}
function rangeFromOffsets(container: Node, s: number, e: number): Range | null {
  const w = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
  let o = 0;
  let sn: Node | null = null,
    sl = 0,
    en: Node | null = null,
    el = 0;
  let n: Node | null;
  while ((n = w.nextNode())) {
    const len = (n.textContent || "").length;
    if (!sn && o + len > s) {
      sn = n;
      sl = s - o;
    }
    if (o + len >= e) {
      en = n;
      el = e - o;
      break;
    }
    o += len;
  }
  if (!sn || !en) return null;
  try {
    const r = document.createRange();
    r.setStart(sn, sl);
    r.setEnd(en, el);
    return r;
  } catch {
    return null;
  }
}

export default function Annotations({ articleId }: { articleId: string }) {
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [anns, setAnns] = useState<Ann[]>([]);
  const sb = getBrowserClient();

  const refresh = () => setAnns([...(getAll()[articleId] || [])]);

  const save = (ann: Ann) => {
    const all = getAll();
    if (!all[articleId]) all[articleId] = [];
    const i = all[articleId].findIndex((a) => a.id === ann.id);
    if (i >= 0) all[articleId][i] = ann;
    else all[articleId].push(ann);
    setAll(all);
    refresh();
    // best-effort cloud
    (async () => {
      try {
        await ensureAnonSession();
        const { data } = await sb.rpc("upsert_annotation", {
          p_article_id: articleId,
          p_text: ann.text,
          p_note: ann.note,
          p_color: ann.color,
          p_start: ann.start,
          p_end: ann.end,
        });
        if (data && ann.id.startsWith("local_")) {
          const a2 = getAll();
          const it = a2[articleId]?.find((a) => a.id === ann.id);
          if (it) {
            it.cloudId = data as string;
            setAll(a2);
          }
        }
      } catch {}
    })();
  };

  const wrap = (range: Range, ann: Ann) => {
    const mark = document.createElement("mark");
    mark.className = "lb-hl lb-hl-" + ann.color;
    mark.dataset.annId = ann.id;
    try {
      range.surroundContents(mark);
    } catch {
      const frag = range.extractContents();
      mark.appendChild(frag);
      range.insertNode(mark);
    }
    mark.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (confirm("Remove this highlight?")) removeAnn(ann.id);
    });
  };

  const highlight = (color: string) => {
    const sel = window.getSelection();
    const content = document.querySelector(".lb-content");
    if (!sel || sel.isCollapsed || !content) return;
    const text = sel.toString().trim();
    if (text.length < 2) return;
    const range = sel.getRangeAt(0);
    const start = textOffset(content, range.startContainer, range.startOffset);
    const end = textOffset(content, range.endContainer, range.endOffset);
    const ann: Ann = { id: genId(), text, note: null, color, start, end, created_at: new Date().toISOString() };
    wrap(range, ann);
    save(ann);
    sel.removeAllRanges();
    setTip(null);
  };

  const removeAnn = (id: string) => {
    const all = getAll();
    const ann = all[articleId]?.find((a) => a.id === id);
    if (all[articleId]) {
      all[articleId] = all[articleId].filter((a) => a.id !== id);
      if (!all[articleId].length) delete all[articleId];
      setAll(all);
      refresh();
    }
    const mark = document.querySelector<HTMLElement>('.lb-hl[data-ann-id="' + id + '"]');
    if (mark && mark.parentNode) {
      while (mark.firstChild) mark.parentNode.insertBefore(mark.firstChild, mark);
      mark.parentNode.removeChild(mark);
    }
    const cid = ann?.cloudId;
    if (cid && !cid.startsWith("local_")) {
      (async () => {
        try {
          await ensureAnonSession();
          await sb.rpc("delete_annotation", { p_annotation_id: cid });
        } catch {}
      })();
    }
  };

  // apply stored highlights (after cloud merge) + selection listener
  useEffect(() => {
    let cancelled = false;
    const apply = () => {
      const content = document.querySelector(".lb-content");
      if (!content) return;
      const list = (getAll()[articleId] || []).slice().sort((a, b) => b.start - a.start);
      list.forEach((ann) => {
        if (content.querySelector('.lb-hl[data-ann-id="' + ann.id + '"]')) return;
        const r = rangeFromOffsets(content, ann.start, ann.end);
        if (r) wrap(r, ann);
      });
      refresh();
    };
    apply();
    (async () => {
      try {
        const { data } = await sb
          .from("reader_annotations")
          .select("id,highlighted_text,note,color,start_offset,end_offset,created_at")
          .eq("article_id", articleId);
        if (cancelled || !data || !data.length) return;
        const all = getAll();
        const local = all[articleId] || [];
        (data as Record<string, unknown>[]).forEach((r) => {
          const exists = local.some(
            (la) => la.cloudId === r.id || (la.start === r.start_offset && la.end === r.end_offset),
          );
          if (!exists)
            local.push({
              id: r.id as string,
              cloudId: r.id as string,
              text: r.highlighted_text as string,
              note: (r.note as string) || null,
              color: r.color as string,
              start: r.start_offset as number,
              end: r.end_offset as number,
              created_at: r.created_at as string,
            });
        });
        all[articleId] = local;
        setAll(all);
        apply();
      } catch {}
    })();

    const onMouseUp = () => {
      const sel = window.getSelection();
      const content = document.querySelector(".lb-content");
      if (!sel || sel.isCollapsed || !content) {
        setTip(null);
        return;
      }
      const text = sel.toString().trim();
      if (text.length < 2) {
        setTip(null);
        return;
      }
      const anchor = sel.anchorNode;
      if (!anchor || !content.contains(anchor.nodeType === 3 ? anchor.parentElement : anchor)) {
        setTip(null);
        return;
      }
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      setTip({ x: rect.left + rect.width / 2, y: rect.top + window.scrollY - 8 });
    };
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      cancelled = true;
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [articleId]);

  return (
    <>
      {tip && (
        <div
          className="lb-quote-tooltip"
          style={{
            position: "absolute",
            left: Math.max(8, tip.x - 110),
            top: tip.y - 44,
            zIndex: 60,
            display: "flex",
            gap: 6,
            alignItems: "center",
            background: "var(--bg2)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: "6px 10px",
            boxShadow: "0 8px 24px rgba(0,0,0,.4)",
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <button
            onClick={() => {
              navigator.clipboard?.writeText(window.getSelection()?.toString() || "");
              setTip(null);
            }}
            style={{ background: "none", border: "none", color: "var(--text)", cursor: "pointer", fontSize: 12 }}
            title="Copy"
          >
            <i className="fa-regular fa-copy" />
          </button>
          {COLORS.map((c) => (
            <span
              key={c}
              onClick={() => highlight(c)}
              title={`Highlight ${c}`}
              style={{
                width: 16,
                height: 16,
                borderRadius: "50%",
                cursor: "pointer",
                background: { yellow: "#facc15", blue: "#60a5fa", green: "#4ade80", pink: "#f472b6" }[c],
                border: "1px solid rgba(0,0,0,.2)",
              }}
            />
          ))}
        </div>
      )}

      {anns.length > 0 && (
        <button
          className="lb-ann-fab"
          onClick={() => setPanelOpen((o) => !o)}
          title="Highlights"
          style={{
            position: "fixed",
            left: 16,
            bottom: 16,
            zIndex: 40,
            width: 46,
            height: 46,
            borderRadius: "50%",
            background: "var(--accent)",
            color: "#06080f",
            border: "none",
            cursor: "pointer",
            fontWeight: 700,
            boxShadow: "0 6px 20px rgba(0,225,255,.3)",
          }}
        >
          <i className="fa-solid fa-highlighter" /> {anns.length}
        </button>
      )}

      {panelOpen && (
        <div
          className="lb-ann-panel"
          style={{
            position: "fixed",
            left: 16,
            bottom: 72,
            zIndex: 41,
            width: 300,
            maxHeight: "60vh",
            overflowY: "auto",
            background: "var(--bg2)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: 14,
            boxShadow: "0 12px 32px rgba(0,0,0,.5)",
          }}
        >
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: "var(--sub)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>
            Highlights ({anns.length})
          </div>
          {anns
            .slice()
            .sort((a, b) => a.start - b.start)
            .map((a) => (
              <div key={a.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "8px 0", borderTop: "1px solid var(--border)" }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", marginTop: 4, flexShrink: 0, background: { yellow: "#facc15", blue: "#60a5fa", green: "#4ade80", pink: "#f472b6" }[a.color] || "#facc15" }} />
                <span style={{ flex: 1, fontSize: 13, color: "var(--text)" }}>{a.text.slice(0, 120)}</span>
                <button onClick={() => removeAnn(a.id)} title="Remove" style={{ background: "none", border: "none", color: "var(--sub)", cursor: "pointer" }}>
                  <i className="fa-regular fa-trash-can" />
                </button>
              </div>
            ))}
        </div>
      )}
    </>
  );
}
