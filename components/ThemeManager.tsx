"use client";
import { useEffect } from "react";
import { getMode, resolveLight, applyTheme } from "@/lib/theme";

// Drives live theme changes. In "auto" mode it re-evaluates time-of-day on an interval
// and flips the theme when the day phase crosses 06:00 / 18:00. Manual light/dark modes
// are applied once and left alone. Single source of truth for applying the theme.
export default function ThemeManager() {
  useEffect(() => {
    let last: boolean | null = null;
    const sync = () => {
      const light = resolveLight(getMode());
      if (light !== last) {
        last = light;
        applyTheme(light);
      }
    };
    sync(); // reconcile meta/event with the pre-paint class
    const id = window.setInterval(sync, 60000);
    // ThemeToggle dispatches this after changing the stored mode.
    const onModeChange = () => {
      last = resolveLight(getMode());
      applyTheme(last);
    };
    window.addEventListener("thememodechange", onModeChange);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("thememodechange", onModeChange);
    };
  }, []);
  return null;
}
