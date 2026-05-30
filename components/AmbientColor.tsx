"use client";
import { useEffect } from "react";
import { weatherToPalette, getPhase, PHASE_BG, type Palette } from "@/lib/weather-palette";

// Ambient personality: the accent/glow colors react to Cairo weather (shared with the
// WeatherWidget's cached fetch — no second request), and a subtle fixed background
// gradient reflects the time of day. Body text is never recolored.
const LS = "cairoWeather";

function applyAccent(p: Palette) {
  let style = document.getElementById("weather-accent") as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = "weather-accent";
    document.head.appendChild(style);
  }
  const vars =
    `--accent:${p.accent};--accent2:${p.accent2};--accent3:${p.accent3};--glow:${p.glow};--glowS:${p.glowS};`;
  // Override both modes so the accent holds through the auto light/dark flip.
  style.textContent = `:root{${vars}}.light-mode{${vars}}`;
}

export default function AmbientColor() {
  useEffect(() => {
    // 1) Weather accent — read the WeatherWidget cache, then listen for live updates.
    const applyFromCache = () => {
      try {
        const cached = JSON.parse(localStorage.getItem(LS) || "null");
        if (cached?.data && cached.data.code !== undefined) {
          applyAccent(weatherToPalette(cached.data.code, !!cached.data.isDay));
        }
      } catch {}
    };
    applyFromCache();
    const onWeather = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d && d.code !== undefined) applyAccent(weatherToPalette(d.code, !!d.isDay));
    };
    window.addEventListener("weatherupdate", onWeather as EventListener);

    // 2) Time-of-day ambient gradient (subtle, static; updates as the phase changes).
    let glow = document.getElementById("ambient-glow") as HTMLDivElement | null;
    if (!glow) {
      glow = document.createElement("div");
      glow.id = "ambient-glow";
      glow.setAttribute("aria-hidden", "true");
      document.body.appendChild(glow);
    }
    const el = glow;
    const applyPhase = () => {
      el.style.background = PHASE_BG[getPhase()];
    };
    applyPhase();
    const id = window.setInterval(applyPhase, 300000); // re-check every 5 min

    return () => {
      window.removeEventListener("weatherupdate", onWeather as EventListener);
      window.clearInterval(id);
    };
  }, []);
  return null;
}
