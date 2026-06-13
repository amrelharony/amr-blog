"use client";
import { usePathname } from "next/navigation";
import ThemeToggle from "./ThemeToggle";
import WeatherWidget from "./WeatherWidget";
import AudioToggle from "./AudioToggle";
import CommandPalette from "./CommandPalette";

// Fixed top-right control bar — mirrors the main site's #topBtns
// (palette · weather · audio · theme). The public ⌘K palette is suppressed on
// /admin, where AdminCommandPalette owns ⌘K (avoids dual keydown handlers).
export default function SiteControls() {
  const isAdmin = (usePathname() || "").startsWith("/admin");
  return (
    <div className="site-controls">
      {!isAdmin && <CommandPalette />}
      <WeatherWidget />
      <AudioToggle />
      <ThemeToggle />
    </div>
  );
}
