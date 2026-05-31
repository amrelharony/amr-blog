"use client";
import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { getPhase } from "@/lib/weather-palette";
import { selectVariation } from "@/lib/intro/select";
import type { IntroCtx } from "@/lib/intro/types";

// Intro SHELL/orchestrator. Owns the #blog-intro overlay, reduced-motion skip, skip
// handlers, safety timeout, clip-path wipe, and the blog:intro-done event. Picks one of
// several variations (different rendering tech) via the smart selector and runs it into
// .intro-root. SSR-rendered so it covers content from first paint (content stays in the DOM
// beneath → SEO intact; a <noscript> rule in layout.tsx hides it without JS).
export default function Intro() {
  const [gone, setGone] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setGone(true);
      return;
    }
    const root = rootRef.current;
    const overlay = overlayRef.current;
    if (!root || !overlay) return;

    const cs = getComputedStyle(document.documentElement);
    const v = (n: string, d: string) => cs.getPropertyValue(n).trim() || d;
    const pal = {
      accent: v("--accent", "#00e1ff"),
      accent2: v("--accent2", "#6366f1"),
      accent3: v("--accent3", "#a855f7"),
      glow: v("--glow", "rgba(0,225,255,.15)"),
      glowS: v("--glowS", "rgba(0,225,255,.4)"),
    };
    let weather: IntroCtx["weather"] = null;
    try {
      const c = JSON.parse(localStorage.getItem("cairoWeather") || "null");
      if (c?.data && c.data.code !== undefined) weather = { code: c.data.code, isDay: !!c.data.isDay };
    } catch {}
    const webgl2 = (() => {
      try {
        return !!document.createElement("canvas").getContext("webgl2");
      } catch {
        return false;
      }
    })();
    const ctx: IntroCtx = {
      root,
      pal,
      phase: getPhase(),
      weather,
      desktop: window.matchMedia("(pointer:fine)").matches && window.innerWidth >= 900,
      webgl2,
      light: document.documentElement.classList.contains("light-mode"),
    };

    let cleanupVar: () => void = () => {};
    let finished = false;
    const wipe = () => {
      if (finished) return;
      finished = true;
      try {
        cleanupVar();
      } catch {}
      gsap.to(overlay, {
        clipPath: "inset(0 0 100% 0)",
        duration: 0.7,
        ease: "power4.inOut",
        onComplete: () => {
          setGone(true);
          window.dispatchEvent(new Event("blog:intro-done"));
        },
      });
    };

    let runRes: { done: Promise<void>; cleanup: () => void };
    try {
      runRes = selectVariation(ctx).run(ctx);
    } catch (e) {
      console.warn("[intro] variation failed:", e);
      setGone(true);
      return;
    }
    cleanupVar = runRes.cleanup;
    // ?introhold freezes the intro (no auto-wipe / skip / safety) for inspection.
    let hold = false;
    try {
      hold = new URLSearchParams(location.search).has("introhold");
    } catch {}
    if (hold) {
      return () => {
        try {
          cleanupVar();
        } catch {}
      };
    }

    runRes.done.then(() => {
      if (!finished) wipe();
    });

    const skip = () => wipe();
    window.addEventListener("click", skip);
    window.addEventListener("wheel", skip, { passive: true });
    window.addEventListener("touchstart", skip, { passive: true });
    window.addEventListener("keydown", skip);
    const safety = window.setTimeout(wipe, 6000);

    return () => {
      try {
        cleanupVar();
      } catch {}
      window.removeEventListener("click", skip);
      window.removeEventListener("wheel", skip);
      window.removeEventListener("touchstart", skip);
      window.removeEventListener("keydown", skip);
      window.clearTimeout(safety);
    };
  }, []);

  if (gone) return null;
  return (
    <div ref={overlayRef} id="blog-intro" aria-hidden="true">
      <div ref={rootRef} className="intro-root" />
    </div>
  );
}
