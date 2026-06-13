"use client";
// Tri-state theme: "auto" (follows time of day, live), "light", "dark".
// The pre-paint inline script in app/layout.tsx sets the initial .light-mode class;
// ThemeManager applies live changes in "auto" mode; ThemeToggle cycles the mode.
export type ThemeMode = "auto" | "light" | "dark";

export function getMode(): ThemeMode {
  try {
    const t = localStorage.getItem("theme");
    if (t === "light" || t === "dark" || t === "auto") return t;
  } catch {}
  return "auto";
}

export function setMode(mode: ThemeMode) {
  try {
    localStorage.setItem("theme", mode);
  } catch {}
}

// Shared UI metadata for mode pickers (ThemeToggle, CommandPalette).
export const THEME_ICONS: Record<ThemeMode, string> = {
  auto: "fa-circle-half-stroke",
  light: "fa-sun",
  dark: "fa-moon",
};
export const THEME_LABELS: Record<ThemeMode, string> = {
  auto: "Theme: Auto (by time of day)",
  light: "Theme: Light",
  dark: "Theme: Dark",
};

/**
 * The full mode-change ritual: persist, drop the sepia override, and notify
 * ThemeManager (which applies the theme + meta theme-color and re-emits
 * "themechange" for particles/ambient/cursor). Single source of truth for
 * every mode picker.
 */
export function applyMode(mode: ThemeMode) {
  setMode(mode);
  document.documentElement.classList.remove("lb-sepia");
  window.dispatchEvent(new Event("thememodechange"));
}

// Local time-of-day: light 06:00–17:59, dark otherwise (mirrors Js/site.js).
export function isLightByTime(d = new Date()): boolean {
  const h = d.getHours();
  return h >= 6 && h < 18;
}

export function resolveLight(mode: ThemeMode): boolean {
  return mode === "light" ? true : mode === "dark" ? false : isLightByTime();
}

// Apply the resolved theme to the document + notify listeners (particles, ambient, cursor).
export function applyTheme(light: boolean) {
  const html = document.documentElement;
  html.classList.toggle("light-mode", light);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", light ? "#f4f6fb" : "#06080f");
  window.dispatchEvent(new CustomEvent("themechange", { detail: { light } }));
}
