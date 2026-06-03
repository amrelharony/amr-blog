"use client";
import { useEffect, useState } from "react";

// Floating article toolbar — ported from initArticleToolbar/initReadingSettings in
// Js/blog-article.js: a bottom-right pill showing reading-time-left + a gear that
// opens Reading Settings (font size / theme / font), persisted to localStorage and
// applied to the article body.
const LS = "_lb_reading_prefs";
const SIZES: [string, string][] = [
  ["S", "15px"],
  ["M", "17px"],
  ["L", "19px"],
  ["XL", "21px"],
];
const THEMES: [string, string][] = [
  ["Dark", "dark"],
  ["Light", "light"],
  ["Sepia", "sepia"],
];
const FONTS: [string, string][] = [
  ["Serif", "'Source Serif 4',Georgia,serif"],
  ["Sans", "'Inter',sans-serif"],
  ["Mono", "'JetBrains Mono',monospace"],
];

interface Prefs {
  fontSize?: string;
  fontFamily?: string;
  theme?: string;
}
function getPrefs(): Prefs {
  try {
    return JSON.parse(localStorage.getItem(LS) || "{}");
  } catch {
    return {};
  }
}

function applyPrefs(p: Prefs) {
  const c = document.querySelector(".lb-content") as HTMLElement | null;
  if (c) {
    if (p.fontSize) c.style.fontSize = p.fontSize;
    if (p.fontFamily) c.style.fontFamily = p.fontFamily;
  }
  // The per-article theme is an *explicit* reader override. If none is set, leave the
  // global theme alone — otherwise mounting the toolbar would strip `light-mode` from
  // <html> and flip an auto/light-themed page to dark (ThemeManager won't restore it,
  // since its cached `last` value hasn't changed).
  if (!p.theme) return;
  const html = document.documentElement;
  html.classList.remove("lb-sepia", "light-mode");
  if (p.theme === "sepia") html.classList.add("lb-sepia");
  else if (p.theme === "light") html.classList.add("light-mode");
  // p.theme === "dark" → keep light-mode removed (forces dark for this reader).
}

export default function ArticleToolbar({ minutes }: { minutes: number }) {
  const [minLeft, setMinLeft] = useState(minutes);
  const [menuOpen, setMenuOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>({});

  useEffect(() => {
    const p = getPrefs();
    setPrefs(p);
    applyPrefs(p);
  }, []);

  useEffect(() => {
    const article = document.querySelector(".lb-article") as HTMLElement | null;
    let raf = false;
    const onScroll = () => {
      if (raf) return;
      raf = true;
      requestAnimationFrame(() => {
        raf = false;
        if (!article) return;
        const total = article.offsetHeight - window.innerHeight;
        if (total <= 0) return;
        const pct = Math.max(0, Math.min(100, ((window.scrollY - article.offsetTop) / total) * 100));
        setMinLeft(Math.max(0, Math.ceil(minutes * (1 - pct / 100))));
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [minutes]);

  // close menu/panel on outside click
  useEffect(() => {
    if (!menuOpen && !panelOpen) return;
    const h = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest(".lb-article-toolbar, .lb-tools-menu, .lb-reading-panel")) return;
      setMenuOpen(false);
      setPanelOpen(false);
    };
    document.addEventListener("click", h);
    return () => document.removeEventListener("click", h);
  }, [menuOpen, panelOpen]);

  const update = (patch: Prefs) => {
    const np = { ...getPrefs(), ...patch };
    try {
      localStorage.setItem(LS, JSON.stringify(np));
    } catch {}
    setPrefs(np);
    applyPrefs(np);
  };

  return (
    <>
      <div className="lb-article-toolbar" style={{ opacity: 1, visibility: "visible" }}>
        <div className="lb-toolbar-progress">{minLeft > 0 ? `${minLeft} min left` : "Done reading"}</div>
        <button
          className={"lb-toolbar-gear" + (menuOpen ? " active" : "")}
          title="Article Tools"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((o) => !o);
          }}
        >
          <i className="fa-solid fa-gear" />
        </button>
      </div>

      {menuOpen && (
        <div className="lb-tools-menu show">
          <div
            className="lb-tools-menu-item"
            onClick={() => {
              setMenuOpen(false);
              setPanelOpen(true);
            }}
          >
            <i className="fa-solid fa-sliders" />
            Reading settings
          </div>
        </div>
      )}

      {panelOpen && (
        <div className="lb-reading-panel show">
          <div className="lb-reading-panel-header">
            <span className="lb-reading-panel-title">READING SETTINGS</span>
            <button className="lb-reading-panel-close" aria-label="Close" onClick={() => setPanelOpen(false)}>
              <i className="fa-solid fa-xmark" />
            </button>
          </div>
          <div className="lb-reading-option">
            <div className="lb-reading-option-label">Font Size</div>
            <div className="lb-reading-options">
              {SIZES.map(([l, v]) => (
                <button key={v} className={"lb-reading-opt" + (prefs.fontSize === v ? " active" : "")} onClick={() => update({ fontSize: v })}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="lb-reading-option">
            <div className="lb-reading-option-label">Theme</div>
            <div className="lb-reading-options">
              {THEMES.map(([l, v]) => (
                <button key={v} className={"lb-reading-opt" + (prefs.theme === v ? " active" : "")} onClick={() => update({ theme: v })}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="lb-reading-option">
            <div className="lb-reading-option-label">Font</div>
            <div className="lb-reading-options">
              {FONTS.map(([l, v]) => (
                <button key={v} className={"lb-reading-opt" + (prefs.fontFamily === v ? " active" : "")} onClick={() => update({ fontFamily: v })}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
