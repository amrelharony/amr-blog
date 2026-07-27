"use client";
import { useEffect, useRef, useState } from "react";
import { getPhase } from "@/lib/weather-palette";
import type { IntroCtx } from "@/lib/intro/types";

// Intro SHELL/orchestrator. Owns the #blog-intro overlay, reduced-motion skip, skip
// handlers, safety timeout, clip-path wipe, and the blog:intro-done event. Picks one of
// several variations (different rendering tech) via the smart selector and runs it into
// .intro-root. SSR-rendered so it covers content from first paint (content stays in the DOM
// beneath → SEO intact; a <noscript> rule in layout.tsx hides it without JS).
// gsap + the variations are dynamic-imported (one async chunk) so the whole intro
// machinery stays out of the shared first-load bundle; the overlay covers the page
// while the chunk loads, and a pre-chunk safety timeout dismisses it if that hangs.
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

    let cancelled = false;
    let teardown: () => void = () => {};
    // If the animation chunk never arrives, drop the overlay rather than
    // covering the page forever. Cleared as soon as the import resolves. Also mark
    // `cancelled` so a chunk that resolves AFTER this fired doesn't run a full variation
    // (incl. a WebGL context) into the now-hidden/detached overlay and attach the global
    // skip listeners outside the normal teardown path.
    const chunkSafety = window.setTimeout(() => {
      cancelled = true;
      setGone(true);
    }, 5000);

    (async () => {
      let gsap: typeof import("gsap").gsap;
      let selectVariation: typeof import("@/lib/intro/select").selectVariation;
      try {
        const [g, s] = await Promise.all([import("gsap"), import("@/lib/intro/select")]);
        gsap = g.gsap;
        selectVariation = s.selectVariation;
      } catch (e) {
        console.warn("[intro] animation chunk failed to load:", e);
        window.clearTimeout(chunkSafety);
        if (!cancelled) setGone(true);
        return;
      }
      window.clearTimeout(chunkSafety);
      if (cancelled) return;

      let cleanupVar: () => void = () => {};
      // Detaches the global skip listeners + safety timer. Assigned once they exist;
      // called both from wipe() and from teardown(), and safe to call twice
      // (removeEventListener / clearTimeout are no-ops when already done).
      let detachSkip: () => void = () => {};
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
            // The effect's deps are [] and setGone only makes this render null — it
            // never unmounts — so without this the four window listeners and the
            // safety timer stayed bound for the life of the document.
            detachSkip();
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
        teardown = () => {
          try {
            cleanupVar();
          } catch {}
        };
        return;
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

      detachSkip = () => {
        window.removeEventListener("click", skip);
        window.removeEventListener("wheel", skip);
        window.removeEventListener("touchstart", skip);
        window.removeEventListener("keydown", skip);
        window.clearTimeout(safety);
      };

      teardown = () => {
        try {
          cleanupVar();
        } catch {}
        detachSkip();
      };
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(chunkSafety);
      teardown();
    };
  }, []);

  if (gone) return null;
  return (
    <div ref={overlayRef} id="blog-intro" aria-hidden="true">
      <div ref={rootRef} className="intro-root" />
    </div>
  );
}
