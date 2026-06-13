"use client";
import { useEffect } from "react";

// Holiday/vacations engine — loads the verbatim main-site engine (public/holiday-engine.js,
// a self-contained GSAP IIFE) after exposing the npm gsap + neutral globals. gsap is
// dynamic-imported so it stays off every page's critical path. Auto-detects
// today's holiday (17 holidays / 8 themes); ?holiday=<theme> forces one for testing.
type HolidayWindow = Window & {
  gsap?: unknown;
  _reducedMotion?: boolean;
  _suspended?: boolean;
  _registerTeardown?: (...a: unknown[]) => void;
  _holidayEngine?: { test?: (theme: string, name: string) => void; cleanup?: () => void };
};

export default function HolidayEngine() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const w = window as HolidayWindow;
    if (w._holidayEngine || document.getElementById("holiday-engine-script")) return;
    w._reducedMotion = false;
    w._suspended = false;
    w._registerTeardown = w._registerTeardown || (() => {});

    let cancelled = false;
    (async () => {
      // The engine IIFE needs window.gsap before it boots.
      if (!w.gsap) {
        try {
          w.gsap = (await import("gsap")).gsap;
        } catch (e) {
          console.warn("[HolidayEngine] gsap failed to load:", e);
          return;
        }
      }
      if (cancelled || document.getElementById("holiday-engine-script")) return;

      const s = document.createElement("script");
      s.id = "holiday-engine-script";
      s.src = "/holiday-engine.js";
      s.async = true;
      s.onload = () => {
        try {
          const theme = new URLSearchParams(location.search).get("holiday");
          if (theme && w._holidayEngine?.test) w._holidayEngine.test(theme, theme);
        } catch {}
      };
      document.body.appendChild(s);
    })();

    return () => {
      cancelled = true;
      try {
        w._holidayEngine?.cleanup?.();
      } catch {}
    };
  }, []);
  return null;
}
