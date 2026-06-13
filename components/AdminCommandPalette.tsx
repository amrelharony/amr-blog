"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase/browser";
import { haptic } from "@/lib/haptics";
import { type ThemeMode, THEME_ICONS, THEME_LABELS, applyMode, getMode } from "@/lib/theme";

// ⌘K command center for /admin. Same accessible shell as the public
// CommandPalette (.cp-* CSS, focus trap, arrow/Enter/Escape) but a STATIC
// admin command set — no /api/search. The public palette is gated off /admin
// (see SiteControls) so only one ⌘K handler runs here. A click trigger
// dispatches the "admin:palette" event.
type Action =
  | { kind: "push"; href: string }
  | { kind: "navigate"; href: string }
  | { kind: "new-article" }
  | { kind: "theme"; mode: ThemeMode }
  | { kind: "logout" };

interface Item {
  id: string;
  icon: string;
  label: string;
  checked?: boolean;
  action: Action;
}
interface Section {
  label: string;
  items: Item[];
}

export const ADMIN_PALETTE_EVENT = "admin:palette";

export default function AdminCommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [mode, setModeState] = useState<ThemeMode>("auto");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveIdx(0);
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

  // ⌘K / Ctrl+K + the click-trigger event.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggle();
      }
    };
    document.addEventListener("keydown", onKey);
    window.addEventListener(ADMIN_PALETTE_EVENT, toggle);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener(ADMIN_PALETTE_EVENT, toggle);
    };
  }, [toggle]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const sections = useMemo<Section[]>(() => {
    const ql = query.trim().toLowerCase();
    const nav: Item[] = [
      { id: "dash", icon: "fa-gauge", label: "Dashboard", action: { kind: "push", href: "/admin" } },
      { id: "write", icon: "fa-pen", label: "Write — article list", action: { kind: "push", href: "/admin/write" } },
      { id: "new-article", icon: "fa-plus", label: "New article", action: { kind: "new-article" } },
      { id: "thoughts", icon: "fa-comment-dots", label: "Thoughts", action: { kind: "push", href: "/admin/thoughts" } },
      { id: "subscribers", icon: "fa-users", label: "Subscribers", action: { kind: "push", href: "/admin/subscribers" } },
      { id: "comments", icon: "fa-comments", label: "Comments", action: { kind: "push", href: "/admin/comments" } },
      { id: "analytics", icon: "fa-chart-line", label: "Analytics", action: { kind: "push", href: "/admin/analytics" } },
      { id: "view-site", icon: "fa-arrow-up-right-from-square", label: "View site", action: { kind: "navigate", href: "/" } },
      { id: "logout", icon: "fa-right-from-bracket", label: "Log out", action: { kind: "logout" } },
    ];
    const theme: Item[] = (["auto", "light", "dark"] as ThemeMode[]).map((m) => ({
      id: `theme-${m}`,
      icon: THEME_ICONS[m],
      label: THEME_LABELS[m],
      checked: mode === m,
      action: { kind: "theme", mode: m },
    }));
    const match = (i: Item) => !ql || i.label.toLowerCase().includes(ql);
    const out: Section[] = [];
    const navF = nav.filter(match);
    const themeF = theme.filter(match);
    if (navF.length) out.push({ label: "GO TO / ACTIONS", items: navF });
    if (themeF.length) out.push({ label: "THEME", items: themeF });
    return out;
  }, [query, mode]);

  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections]);
  const offsets = useMemo(() => {
    const out: number[] = [];
    let n = 0;
    for (const s of sections) {
      out.push(n);
      n += s.items.length;
    }
    return out;
  }, [sections]);
  const safeIdx = flat.length === 0 ? 0 : Math.min(activeIdx, flat.length - 1);

  useEffect(() => {
    listRef.current?.querySelector(`#acp-item-${safeIdx}`)?.scrollIntoView({ block: "nearest" });
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
      case "new-article":
        // ?new handles cross-page navigation; the event handles the same-page
        // case (router.push to an unchanged URL won't re-fire the effect).
        close();
        router.push("/admin/write?new=1");
        window.dispatchEvent(new Event("admin:new-article"));
        break;
      case "logout":
        close();
        getBrowserClient()
          .auth.signOut()
          .finally(() => {
            router.push("/admin/login");
            router.refresh();
          });
        break;
      case "theme": {
        const m = item.action.mode;
        applyMode(m);
        setModeState(m);
        haptic.toggle();
        break;
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
        e.preventDefault();
        break;
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="cp-overlay" onClick={close}>
      <div
        className="cp-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Admin command palette"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="cp-input-row">
          <i className="fa-solid fa-terminal" aria-hidden="true" />
          <input
            ref={inputRef}
            className="cp-input"
            type="text"
            placeholder="Admin commands…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            role="combobox"
            aria-expanded={flat.length > 0}
            aria-controls="acp-list"
            aria-activedescendant={flat.length ? `acp-item-${safeIdx}` : undefined}
            aria-autocomplete="list"
          />
          <kbd className="cp-kbd">ESC</kbd>
        </div>
        <div className="cp-list" id="acp-list" role="listbox" ref={listRef}>
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
                    id={`acp-item-${i}`}
                    className={"cp-item" + (i === safeIdx ? " active" : "")}
                    role="option"
                    aria-selected={i === safeIdx}
                    onMouseEnter={() => setActiveIdx(i)}
                    onClick={() => run(item)}
                  >
                    <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
                    <div className="cp-item-body">
                      <div className="cp-item-label">{item.label}</div>
                    </div>
                    {item.checked && <i className="fa-solid fa-check cp-check" aria-hidden="true" />}
                  </div>
                );
              })}
            </div>
          ))}
          {flat.length === 0 && <div className="cp-empty">No matching command.</div>}
        </div>
        <div className="cp-foot">
          <span>
            <kbd className="cp-kbd">↑↓</kbd> navigate
          </span>
          <span>
            <kbd className="cp-kbd">↵</kbd> run
          </span>
          <span>
            <kbd className="cp-kbd">⌘K</kbd> toggle
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
