"use client";
import { useEffect } from "react";

// Custom cursor — ported from Js/site.js:253-263. A soft glow that eases toward the
// pointer + a dot that expands over interactive elements. Native cursor stays visible.
// (Per-card 3D tilt is intentionally omitted — it would fight the GSAP cardMicro scale.)
const HOVER_SEL =
  "a[href], button, .lb-card-v2, .lb-tag-chip, .lb-rx-btn, .blog-reaction-btn, .sc-btn, .lb-continue-card, .adm-btn, .mascot-float";

export default function CustomCursor() {
  useEffect(() => {
    if (window.matchMedia("(pointer:coarse)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const glow = document.createElement("div");
    glow.className = "cg";
    const dot = document.createElement("div");
    dot.className = "cd";
    document.body.appendChild(glow);
    document.body.appendChild(dot);

    const mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    let gx = mouse.x;
    let gy = mouse.y;
    let raf = 0;

    const onMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      dot.style.left = e.clientX + "px";
      dot.style.top = e.clientY + "px";
      glow.classList.add("on");
    };
    const onOver = (e: MouseEvent) => {
      if ((e.target as Element)?.closest?.(HOVER_SEL)) dot.classList.add("hov");
    };
    const onOut = (e: MouseEvent) => {
      if ((e.target as Element)?.closest?.(HOVER_SEL)) dot.classList.remove("hov");
    };
    const onLeave = () => glow.classList.remove("on");

    const loop = () => {
      if (!document.hidden) {
        gx += (mouse.x - gx) * 0.08;
        gy += (mouse.y - gy) * 0.08;
        glow.style.left = gx + "px";
        glow.style.top = gy + "px";
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    document.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseover", onOver, { passive: true });
    document.addEventListener("mouseout", onOut, { passive: true });
    document.addEventListener("mouseleave", onLeave);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
      document.removeEventListener("mouseleave", onLeave);
      glow.remove();
      dot.remove();
    };
  }, []);
  return null;
}
