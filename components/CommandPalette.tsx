"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { haptic } from "@/lib/haptics";
import { highlight } from "@/lib/highlight";
import { type ThemeMode, getMode, setMode } from "@/lib/theme";
import { queryTerms, type SearchResponse } from "@/lib/search";

// ⌘K / Ctrl+K command palette: quick navigation, theme switching, and
// full-text search (same /api/search endpoint as FeedSearch). Zero-dep,
// plain CSS (.cp-*), portaled to <body> so .site-controls' stacking
// context can't trap the fixed overlay.
const MIN_QUERY = 2;
const DEBOUNCE_MS = 250;

type Action =
  | { kind: "push"; href: string }
  | { kind: "navigate"; href: string } // full navigation (non-HTML routes like RSS)
  | { kind: "theme"; mode: ThemeMode };

interface Item {
  id: string;
  icon: string;
  label: string;
  hint?: string;
  checked?: boolean;
  action: Action;
}

interface Section {
  label: string;
  items: Item[];
}

const THEME_LABEL: Record<ThemeMode, string> = {
  auto: "Theme: Auto (by time of day)",
  light: "Theme: Light",
  dark: "Theme: Dark",
};
const THEME_ICON: Record<ThemeMode, string> = {
  auto: "fa-circle-half-stroke",
  light: "fa-sun",
  dark: "fa-moon",
};

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [res, setRes] = useState<SearchResponse | null>(null);
  const [mode, setModeState] = useState<ThemeMode>("auto");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const ctrl = useRef<AbortController | null>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setRes(null);
    setActiveIdx(0);
    ctrl.current?.abort();
    haptic.menuClose();
    restoreFocus.current?.focus?.();
    restoreFocus.current = null;
  }, []);

  const toggle = useCallback(() => {
    if (open) {
      close();
    } else {
      restoreFocus.current = document.activeElement as HTMLElement | null;
      setModeState(getMode());
      setOpen(true);
      haptic.menuOpen();
    }
  }, [open, close]);

  // Global shortcut — allowed even while typing in other inputs (standard
  // palette behavior); everything else is scoped to the open overlay.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggle();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [toggle]);

  // Focus the input and lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Debounced search fetch, mirroring FeedSearch.
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < MIN_QUERY) {
      setRes(null);
      return;
    }
    const t = setTimeout(async () => {
      ctrl.current?.abort();
      const ac = new AbortController();
      ctrl.current = ac;
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ac.signal });
        if (!r.ok) throw new Error(`search HTTP ${r.status}`);
        const data = (await r.json()) as SearchResponse;
        if (!ac.signal.aborted) setRes(data);
      } catch (e) {
        // Static commands keep working; the search groups just stay empty.
        if (!ac.signal.aborted) console.error("[CommandPalette] search failed:", e);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [open, query]);

  const sections = useMemo<Section[]>(() => {
    const ql = query.trim().toLowerCase();
    const allCommands: Item[] = [
      { id: "nav-home", icon: "fa-house", label: "Home", action: { kind: "push", href: "/" } },
      { id: "nav-thoughts", icon: "fa-comment-dots", label: "Thoughts", action: { kind: "push", href: "/thoughts" } },
      { id: "nav-rss", icon: "fa-rss", label: "RSS Feed", action: { kind: "navigate", href: "/feed.xml" } },
      ...(["auto", "light", "dark"] as ThemeMode[]).map<Item>((m) => ({
        id: `theme-${m}`,
        icon: THEME_ICON[m],
        label: THEME_LABEL[m],
        checked: mode === m,
        action: { kind: "theme", mode: m },
      })),
    ];
    const commands = allCommands.filter((c) => !ql || c.label.toLowerCase().includes(ql));

    const out: Section[] = [];
    if (commands.length) out.push({ label: "COMMANDS", items: commands });
    if (res?.articles.length) {
      out.push({
        label: "ARTICLES",
        items: res.articles.map((a) => ({
          id: `article-${a.slug}`,
          icon: "fa-newspaper",
          label: a.title,
          hint: a.snippet || a.excerpt,
          action: { kind: "push", href: `/p/${a.slug}` },
        })),
      });
    }
    if (res?.thoughts.length) {
      out.push({
        label: "THOUGHTS",
        items: res.thoughts.map((t) => ({
          id: `thought-${t.id}`,
          icon: "fa-comment-dots",
          label: t.snippet,
          action: { kind: "push", href: "/thoughts" },
        })),
      });
    }
    if (res?.tags.length) {
      out.push({
        label: "TAGS",
        items: res.tags.map((t) => ({
          id: `tag-${t}`,
          icon: "fa-tag",
          label: t,
          action: { kind: "push", href: `/tag/${encodeURIComponent(t)}` },
        })),
      });
    }
    return out;
  }, [query, res, mode]);

  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections]);
  // Flat index of each section's first item, so rows get stable global
  // indices without mutating a counter during render.
  const offsets = useMemo(() => {
    const out: number[] = [];
    let n = 0;
    for (const s of sections) {
      out.push(n);
      n += s.items.length;
    }
    return out;
  }, [sections]);

  // Clamp at render time so the active row stays valid as results change.
  const safeIdx = flat.length === 0 ? 0 : Math.min(activeIdx, flat.length - 1);

  // Keep the active row in view while arrowing.
  useEffect(() => {
    listRef.current
      ?.querySelector(`#cp-item-${safeIdx}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [safeIdx]);

  const run = (item: Item) => {
    switch (item.action.kind) {
      case "push":
        close();
        router.push(item.action.href);
        break;
      case "navigate":
        close();
        window.location.assign(item.action.href);
        break;
      case "theme": {
        // Exact ThemeToggle contract: persist, drop sepia, notify ThemeManager.
        const m = item.action.mode;
        setMode(m);
        setModeState(m);
        document.documentElement.classList.remove("lb-sepia");
        window.dispatchEvent(new Event("thememodechange"));
        haptic.toggle();
        break; // stays open so the change is visible
      }
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        close();
        break;
      case "ArrowDown":
        e.preventDefault();
        if (flat.length) setActiveIdx((safeIdx + 1) % flat.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        if (flat.length) setActiveIdx((safeIdx - 1 + flat.length) % flat.length);
        break;
      case "Home":
        e.preventDefault();
        setActiveIdx(0);
        break;
      case "End":
        e.preventDefault();
        if (flat.length) setActiveIdx(flat.length - 1);
        break;
      case "Enter":
        e.preventDefault();
        if (flat[safeIdx]) run(flat[safeIdx]);
        break;
      case "Tab":
        // Focus trap: the input is the only tab stop; arrows drive selection.
        e.preventDefault();
        break;
    }
  };

  const terms = queryTerms(query.trim());
  const searching = query.trim().length >= MIN_QUERY;
  const noHits = searching && res !== null && sections.length === 0;

  return (
    <>
      <button
        className="sc-btn"
        onClick={toggle}
        title="Search & commands (Ctrl K)"
        aria-label="Open command palette"
        aria-haspopup="dialog"
      >
        <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div className="cp-overlay" onClick={close}>
            <div
              className="cp-panel"
              role="dialog"
              aria-modal="true"
              aria-label="Command palette"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={onKeyDown}
            >
              <div className="cp-input-row">
                <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
                <input
                  ref={inputRef}
                  className="cp-input"
                  type="text"
                  placeholder="Search articles, thoughts, commands…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  role="combobox"
                  aria-expanded={flat.length > 0}
                  aria-controls="cp-list"
                  aria-activedescendant={flat.length ? `cp-item-${safeIdx}` : undefined}
                  aria-autocomplete="list"
                />
                <kbd className="cp-kbd">ESC</kbd>
              </div>
              <div className="cp-list" id="cp-list" role="listbox" ref={listRef}>
                {sections.map((s, si) => (
                  <div key={s.label} role="presentation">
                    <div className="cp-label" role="presentation">
                      {s.label}
                    </div>
                    {s.items.map((item, ii) => {
                      const i = offsets[si] + ii;
                      return (
                        <div
                          key={item.id}
                          id={`cp-item-${i}`}
                          className={"cp-item" + (i === safeIdx ? " active" : "")}
                          role="option"
                          aria-selected={i === safeIdx}
                          onMouseEnter={() => setActiveIdx(i)}
                          onClick={() => run(item)}
                        >
                          <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
                          <div className="cp-item-body">
                            <div className="cp-item-label">{highlight(item.label, terms)}</div>
                            {item.hint && (
                              <div className="cp-item-hint">{highlight(item.hint, terms)}</div>
                            )}
                          </div>
                          {item.checked && (
                            <i className="fa-solid fa-check cp-check" aria-hidden="true" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
                {noHits && <div className="cp-empty">No matches. Try a different search.</div>}
              </div>
              <div className="cp-foot">
                <span>
                  <kbd className="cp-kbd">↑↓</kbd> navigate
                </span>
                <span>
                  <kbd className="cp-kbd">↵</kbd> open
                </span>
                <span>
                  <kbd className="cp-kbd">⌘K</kbd> toggle
                </span>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
