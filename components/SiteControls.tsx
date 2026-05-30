"use client";
import ThemeToggle from "./ThemeToggle";
import WeatherWidget from "./WeatherWidget";
import AudioToggle from "./AudioToggle";

// Fixed top-right control bar — mirrors the main site's #topBtns (weather · audio · theme).
export default function SiteControls() {
  return (
    <div className="site-controls">
      <WeatherWidget />
      <AudioToggle />
      <ThemeToggle />
    </div>
  );
}
