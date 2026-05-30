"use client";
import ThemeToggle from "./ThemeToggle";
import WeatherWidget from "./WeatherWidget";

// Fixed top-right control bar — mirrors the main site's #topBtns.
// Audio toggle is added in the audio milestone.
export default function SiteControls() {
  return (
    <div className="site-controls">
      <WeatherWidget />
      <ThemeToggle />
    </div>
  );
}
