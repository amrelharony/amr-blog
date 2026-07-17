"use client";
import { useEffect, useState } from "react";
import { haptic } from "@/lib/haptics";
import { type ThemeMode, THEME_ICONS, THEME_LABELS, applyMode, getMode } from "@/lib/theme";

// Cycle button: auto → light → dark → auto. "auto" follows time of day (live, via
// ThemeManager). Stores the mode in localStorage 'theme'; ThemeManager does the applying.
const NEXT: Record<ThemeMode, ThemeMode> = { auto: "light", light: "dark", dark: "auto" };

export default function ThemeToggle() {
  const [mode, setModeState] = useState<ThemeMode>("auto");

  useEffect(() => {
    setModeState(getMode());
    // Other pickers (Command Palette, applyMode) change the stored mode and dispatch this;
    // re-read so this button's icon and cycle position don't go stale.
    const onModeChange = () => setModeState(getMode());
    window.addEventListener("thememodechange", onModeChange);
    return () => window.removeEventListener("thememodechange", onModeChange);
  }, []);

  const cycle = () => {
    const next = NEXT[mode];
    setModeState(next);
    applyMode(next); // shared persist + notify ritual (lib/theme.ts)
    haptic.toggle();
  };

  return (
    <button
      className={"sc-btn" + (mode === "auto" ? " active" : "")}
      onClick={cycle}
      title={THEME_LABELS[mode]}
      aria-label={THEME_LABELS[mode]}
    >
      <i className={"fa-solid " + THEME_ICONS[mode]} aria-hidden="true" />
    </button>
  );
}
