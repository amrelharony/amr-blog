"use client";
import ThemeToggle from "./ThemeToggle";
import WeatherWidget from "./WeatherWidget";
import AudioToggle from "./AudioToggle";
import CommandPalette from "./CommandPalette";

// Fixed top-right control bar — mirrors the main site's #topBtns
// (palette · weather · audio · theme).
export default function SiteControls() {
  return (
    <div className="site-controls">
      <CommandPalette />
      <WeatherWidget />
      <AudioToggle />
      <ThemeToggle />
    </div>
  );
}
