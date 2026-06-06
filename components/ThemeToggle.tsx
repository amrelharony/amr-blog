"use client";
import { useEffect, useRef, useState } from "react";
import { haptic } from "@/lib/haptics";
import { type ThemeMode, getMode, setMode } from "@/lib/theme";

// Cycle button: auto → light → dark → auto. "auto" follows time of day (live, via
// ThemeManager). Stores the mode in localStorage 'theme'; ThemeManager does the applying.
const NEXT: Record<ThemeMode, ThemeMode> = { auto: "light", light: "dark", dark: "auto" };
const ICON: Record<ThemeMode, string> = {
  auto: "fa-circle-half-stroke",
  light: "fa-sun",
  dark: "fa-moon",
};
const LABEL: Record<ThemeMode, string> = {
  auto: "Theme: Auto (by time of day)",
  light: "Theme: Light",
  dark: "Theme: Dark",
};

export default function ThemeToggle() {
  const [mode, setModeState] = useState<ThemeMode>("auto");
  // Mirror the committed mode in a ref so cycle() always transitions from the real
  // stored value — not the stale "auto" render-closure before the mount effect runs
  // (which would otherwise cycle from the wrong base on an early/rapid click).
  const modeRef = useRef<ThemeMode>("auto");

  useEffect(() => {
    const m = getMode();
    modeRef.current = m;
    setModeState(m);
  }, []);

  const cycle = () => {
    const next = NEXT[modeRef.current];
    modeRef.current = next;
    setModeState(next);
    setMode(next);
    document.documentElement.classList.remove("lb-sepia");
    window.dispatchEvent(new Event("thememodechange"));
    haptic.toggle();
  };

  return (
    <button
      className={"sc-btn" + (mode === "auto" ? " active" : "")}
      onClick={cycle}
      title={LABEL[mode]}
      aria-label={LABEL[mode]}
    >
      <i className={"fa-solid " + ICON[mode]} aria-hidden="true" />
    </button>
  );
}
