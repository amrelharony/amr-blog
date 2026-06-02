"use client";
import { useEffect, useState } from "react";

// Cairo weather — ported from Js/ui-peripherals.js. Open-Meteo (no key) + 1h cache.
const API =
  "https://api.open-meteo.com/v1/forecast?latitude=30.0444&longitude=31.2357&current=temperature_2m,weather_code,is_day,wind_speed_10m";
const LS = "cairoWeather";
const TTL = 3600000;

function iconFor(code: number, isDay: boolean): string {
  if (code <= 1) return isDay ? "fa-sun" : "fa-moon";
  if (code === 2) return isDay ? "fa-cloud-sun" : "fa-cloud-moon";
  if (code === 3) return "fa-cloud";
  if (code <= 48) return "fa-smog";
  if (code <= 55) return "fa-cloud-rain";
  if (code <= 57) return "fa-snowflake";
  if (code <= 65) return "fa-cloud-showers-heavy";
  if (code <= 77) return "fa-snowflake";
  if (code <= 82) return "fa-cloud-showers-heavy";
  if (code <= 86) return "fa-snowflake";
  return "fa-cloud-bolt";
}
function tempColor(t: number): string {
  if (t < 5) return "#60a5fa";
  if (t < 15) return "#38bdf8";
  if (t < 25) return "var(--text)";
  if (t < 35) return "#f59e0b";
  return "#ef4444";
}

export default function WeatherWidget() {
  const [w, setW] = useState<{ temp: number; code: number; isDay: boolean } | null>(null);

  useEffect(() => {
    const load = async () => {
      if (document.hidden) return;
      try {
        const cached = JSON.parse(localStorage.getItem(LS) || "null");
        if (cached && Date.now() - cached.ts < TTL) {
          setW(cached.data);
          window.dispatchEvent(new CustomEvent("weatherupdate", { detail: cached.data }));
          return;
        }
      } catch {}
      try {
        const r = await fetch(API);
        const j = await r.json();
        const c = j.current;
        const data = { temp: Math.round(c.temperature_2m), code: c.weather_code, isDay: c.is_day === 1 };
        setW(data);
        window.dispatchEvent(new CustomEvent("weatherupdate", { detail: data }));
        try {
          localStorage.setItem(LS, JSON.stringify({ data, ts: Date.now() }));
        } catch {}
      } catch {
        /* offline — keep spinner/last */
      }
    };
    load();
    const timer = setInterval(load, TTL);
    // If the page first loaded in a background tab, load() bailed on document.hidden —
    // retry when the tab becomes visible so the widget isn't stuck on the spinner.
    const onVisible = () => {
      if (!document.hidden) load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!w) {
    return (
      <span className="sc-btn sc-weather" title="Weather" aria-label="Weather loading">
        <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" />
      </span>
    );
  }
  return (
    <span className="sc-btn sc-weather" title="Cairo weather" aria-label={`Cairo ${w.temp} degrees`}>
      <i className={"fa-solid " + iconFor(w.code, w.isDay)} aria-hidden="true" />
      <span style={{ color: tempColor(w.temp) }}>{w.temp}°</span>
    </span>
  );
}
