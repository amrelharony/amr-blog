"use client";
import { useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { getLists, removeFromList, type ReadingList } from "@/lib/collections";
import { fmtDate } from "@/lib/format";
import {
  READER_KEYS,
  buildExport,
  validateImport,
  mergeAnnotations,
  mergeHistory,
  mergeLists,
  type ExportedAnnotation,
  type ExportedHistoryEntry,
} from "@/lib/reader-data";

// The reader's device-local library: saved lists (lib/collections.ts),
// highlights (components/Annotations.tsx store), and reading history
// (components/ReadingTracker.tsx store) — plus JSON export/import for data
// ownership. Import merges (never replaces); clears are per-section.
// Everything renders after mount: the stores are localStorage-only.

type AnnStore = Record<string, ExportedAnnotation[]>;
type HistStore = Record<string, ExportedHistoryEntry>;

function readStore<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "") as T;
  } catch {
    return fallback;
  }
}

// Hydration-safe mount gate: false during SSR + hydration, true right after —
// so localStorage is only read once we're client-side (no setState-in-effect).
const noopSubscribe = () => () => {};
function useMounted(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

export default function LibraryClient() {
  const mounted = useMounted();
  // Stores are read directly during render (cheap at this size); bumping
  // `version` after a mutation (remove/import/clear) forces a fresh read.
  const [, setVersion] = useState(0);
  const refresh = () => setVersion((v) => v + 1);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const lists: ReadingList[] = mounted ? getLists() : [];
  const anns: AnnStore = mounted ? readStore<AnnStore>(READER_KEYS.annotations, {}) : {};
  const history: HistStore = mounted ? readStore<HistStore>(READER_KEYS.history, {}) : {};

  if (!mounted) return null;

  const historyEntries = Object.entries(history)
    .filter(([, e]) => e && (e.slug || e.title))
    .sort(([, a], [, b]) => (b.last_read_at || "").localeCompare(a.last_read_at || ""));

  const annEntries = Object.entries(anns).filter(([, list]) => list?.length);
  const annCount = annEntries.reduce((s, [, list]) => s + list.length, 0);

  const exportAll = () => {
    const doc = buildExport({
      lists: localStorage.getItem(READER_KEYS.lists),
      annotations: localStorage.getItem(READER_KEYS.annotations),
      history: localStorage.getItem(READER_KEYS.history),
      theme: localStorage.getItem(READER_KEYS.theme),
    });
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `fintech-bilinguals-library-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setMsg("Exported.");
  };

  const importFile = async (file: File) => {
    try {
      const doc = validateImport(await file.text());
      const curLists = readStore<{ lists: ReadingList[] }>(READER_KEYS.lists, { lists: [] });
      // ReadingList is structurally a superset of ExportedList (extra cover_image
      // on items) — merge preserves unknown fields because it copies items whole.
      const mergedLists = mergeLists(
        (curLists.lists || []) as unknown as Parameters<typeof mergeLists>[0],
        doc.lists,
      );
      localStorage.setItem(READER_KEYS.lists, JSON.stringify({ lists: mergedLists }));
      localStorage.setItem(
        READER_KEYS.annotations,
        JSON.stringify(mergeAnnotations(readStore<AnnStore>(READER_KEYS.annotations, {}), doc.annotations)),
      );
      localStorage.setItem(
        READER_KEYS.history,
        JSON.stringify(mergeHistory(readStore<HistStore>(READER_KEYS.history, {}), doc.history)),
      );
      refresh();
      setMsg("Imported — merged with what was already here.");
    } catch (e) {
      setMsg("Import failed: " + (e as Error).message);
    }
  };

  const clearSection = (key: string, label: string) => {
    if (!window.confirm(`Clear ${label} on this device? This cannot be undone.`)) return;
    try {
      localStorage.removeItem(key);
    } catch {}
    refresh();
    setMsg(`${label} cleared.`);
  };

  return (
    <div className="lb-library">
      <div className="lb-library-actions">
        <button type="button" className="lb-library-btn" onClick={exportAll}>
          <i className="fa-solid fa-download" aria-hidden="true" /> Export JSON
        </button>
        <button type="button" className="lb-library-btn" onClick={() => fileRef.current?.click()}>
          <i className="fa-solid fa-upload" aria-hidden="true" /> Import
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importFile(f);
            e.target.value = "";
          }}
        />
        {msg && (
          <span className="lb-library-msg" role="status">
            {msg}
          </span>
        )}
      </div>

      {/* ── Saved lists ── */}
      <section aria-label="Saved reading lists">
        <h2 className="lb-library-h2">
          <i className="fa-solid fa-bookmark" aria-hidden="true" /> Saved
        </h2>
        {lists.every((l) => l.items.length === 0) ? (
          <p className="lb-library-empty">
            Nothing saved yet — use the 🔖 button on any article.
          </p>
        ) : (
          lists
            .filter((l) => l.items.length > 0)
            .map((l) => (
              <div key={l.id} className="lb-library-list">
                <div className="lb-library-list-name">
                  {l.emoji} {l.name} <span className="lb-library-count">{l.items.length}</span>
                </div>
                <ul>
                  {l.items.map((it) => (
                    <li key={it.articleId}>
                      <Link href={`/p/${it.slug}`}>{it.title || it.slug}</Link>
                      <button
                        type="button"
                        className="lb-library-x"
                        aria-label={`Remove ${it.title || it.slug} from ${l.name}`}
                        onClick={() => {
                          removeFromList(l.id, it.articleId);
                          refresh();
                        }}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
        )}
      </section>

      {/* ── Highlights & notes ── */}
      <section aria-label="Highlights and notes">
        <h2 className="lb-library-h2">
          <i className="fa-solid fa-highlighter" aria-hidden="true" /> Highlights{" "}
          {annCount > 0 && <span className="lb-library-count">{annCount}</span>}
        </h2>
        {annEntries.length === 0 ? (
          <p className="lb-library-empty">
            No highlights yet — select any text inside an article to highlight it.
          </p>
        ) : (
          <>
            {annEntries.map(([articleId, list]) => {
              const h = history[articleId];
              return (
                <div key={articleId} className="lb-library-list">
                  <div className="lb-library-list-name">
                    {h?.slug ? (
                      <Link href={`/p/${h.slug}`}>{h.title || h.slug}</Link>
                    ) : (
                      <span>Article no longer in recent history</span>
                    )}
                    <span className="lb-library-count">{list.length}</span>
                  </div>
                  <ul>
                    {list.map((a) => (
                      <li key={a.id} className={`lb-library-ann hl-${a.color}`}>
                        <span className="lb-library-ann-text">“{a.text.slice(0, 160)}”</span>
                        {a.note && <span className="lb-library-ann-note">{a.note}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            <button
              type="button"
              className="lb-library-btn danger"
              onClick={() => clearSection(READER_KEYS.annotations, "all highlights")}
            >
              Clear all highlights
            </button>
          </>
        )}
      </section>

      {/* ── Reading history ── */}
      <section aria-label="Reading history">
        <h2 className="lb-library-h2">
          <i className="fa-solid fa-clock-rotate-left" aria-hidden="true" /> History
        </h2>
        {historyEntries.length === 0 ? (
          <p className="lb-library-empty">No reading history yet.</p>
        ) : (
          <>
            <ul className="lb-library-history">
              {historyEntries.map(([id, e]) => (
                <li key={id}>
                  <Link href={`/p/${e.slug}`}>{e.title || e.slug}</Link>
                  <span className="lb-library-hmeta">
                    {e.completed ? "finished" : `${Math.round((e.progress || 0) * 100)}%`}
                    {e.last_read_at ? ` · ${fmtDate(e.last_read_at)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="lb-library-btn danger"
              onClick={() => clearSection(READER_KEYS.history, "reading history")}
            >
              Clear history
            </button>
          </>
        )}
      </section>

      <p className="lb-library-note">
        Everything on this page lives in this browser only (with best-effort anonymous cloud
        backup for saves and highlights). Export before switching devices.
      </p>
    </div>
  );
}
