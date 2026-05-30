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
