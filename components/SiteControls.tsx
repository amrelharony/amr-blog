"use client";
import { useEffect, useRef, useState } from "react";
import ThemeToggle from "./ThemeToggle";
import WeatherWidget from "./WeatherWidget";
import AudioToggle from "./AudioToggle";
import CommandPalette from "./CommandPalette";
import { haptic } from "@/lib/haptics";

// Fixed top-right control bar — mirrors the main site's #topBtns
// (palette · weather · audio · theme).
//
// On phones (≤600px) the group collapses behind a single ⋯ button so it costs one
// button of screen edge instead of four (the mascot + article nav crowd the same
// corner). The breakpoint is CSS-only (.sc-toggle is display:none above it), so
// `open` is inert on wider screens and there's no viewport guess to get wrong
// during hydration.
export default function SiteControls() {
  const [open, setOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  // Collapse again on outside tap / Escape. `pointerdown` (not click) so it also
  // closes when the tap lands on something that re-renders itself away.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={"site-controls" + (open ? " open" : "")} ref={barRef}>
      <button
        className="sc-btn sc-toggle"
        onClick={() => {
          setOpen((o) => !o);
          haptic.toggle();
        }}
        aria-expanded={open}
        aria-controls="site-controls-group"
        aria-label={open ? "Hide site controls" : "Show site controls"}
        title={open ? "Hide controls" : "Controls"}
      >
        <i className={"fa-solid " + (open ? "fa-xmark" : "fa-ellipsis")} aria-hidden="true" />
      </button>
      <div className="sc-group" id="site-controls-group">
        <CommandPalette />
        <WeatherWidget />
        <AudioToggle />
        <ThemeToggle />
      </div>
    </div>
  );
}
