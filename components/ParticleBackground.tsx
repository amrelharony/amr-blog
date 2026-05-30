"use client";
import { useEffect, useRef } from "react";

// 2D particle-network background — ported from Js/site.js (193-239) + particle-worker.js.
// OffscreenCanvas → Web Worker draws the network; reduced-motion safe; theme-aware color.
export default function ParticleBackground() {
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (typeof Worker === "undefined") return;
    const container = wrap.current;
    if (!container) return;

    const cv = document.createElement("canvas");
    if (typeof cv.transferControlToOffscreen !== "function") return; // no OffscreenCanvas → skip
    container.appendChild(cv);

    const isDesktop = window.matchMedia("(pointer:fine)").matches && window.innerWidth > 700;
    const count = isDesktop ? 90 : 45;
    const colorFor = () =>
      document.documentElement.classList.contains("light-mode") ? { r: 15, g: 23, b: 42 } : { r: 0, g: 225, b: 255 };

    let worker: Worker;
    try {
      worker = new Worker("/particle-worker.js");
      const off = cv.transferControlToOffscreen();
      worker.postMessage(
        { type: "init", canvas: off, W: window.innerWidth, H: window.innerHeight, count, CD: 140, MR: 200, color: colorFor() },
        [off],
      );
    } catch {
      cv.remove();
      return;
    }
    const w = worker;
    const onMove = (e: PointerEvent) => w.postMessage({ type: "input", mouse: { x: e.clientX, y: e.clientY } });
    const onResize = () => w.postMessage({ type: "resize", W: window.innerWidth, H: window.innerHeight });
    const onTheme = () => w.postMessage({ type: "color", color: colorFor() });
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("themechange", onTheme as EventListener);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("themechange", onTheme as EventListener);
      w.terminate();
      cv.remove();
    };
  }, []);

  return <div ref={wrap} className="bg-particles-wrap" aria-hidden="true" />;
}
