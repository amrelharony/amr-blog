"use client";
import { useEffect, useState } from "react";
import { haptic } from "@/lib/haptics";

// Dark/Light theme toggle — ported from applyTheme() in Js/site.js. Applies
// `.light-mode` on <html>, persists to localStorage 'theme'. (The pre-paint inline
// script in the layout sets the initial class to avoid a flash.)
export default function ThemeToggle() {
  const [light, setLight] = useState(false);

  useEffect(() => {
    setLight(document.documentElement.classList.contains("light-mode"));
  }, []);

  const toggle = () => {
    const next = !light;
    setLight(next);
    const html = document.documentElement;
    html.classList.toggle("light-mode", next);
    html.classList.remove("lb-sepia");
    try {
      localStorage.setItem("theme", next ? "light" : "dark");
    } catch {}
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", next ? "#f4f6fb" : "#06080f");
    window.dispatchEvent(new CustomEvent("themechange", { detail: { light: next } }));
    haptic.toggle();
  };

  return (
    <button className="sc-btn" onClick={toggle} title="Toggle theme" aria-label="Toggle light/dark theme">
      <i className={"fa-solid " + (light ? "fa-moon" : "fa-sun")} aria-hidden="true" />
    </button>
  );
}
