"use client";
import { gsap } from "gsap";
import type { IntroCtx, IntroRun, IntroVariation } from "../types";
import { WORDMARK } from "../types";

// Variation: "terminal boot" — staged preloader bar → wordmark scramble → accent sweep.
// CSS/GSAP only; always eligible (the safe fallback). Lifted from the original Intro.tsx.
const STAGES = ["RESOLVING DNS", "ESTABLISHING TLS", "LOADING MODULES", "RENDERING INTERFACE", "READY"];
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/\\<>*#";

function run(ctx: IntroCtx): IntroRun {
  const { root } = ctx;
  root.innerHTML =
    '<div class="bi-inner">' +
    '<div class="bi-word"></div><div class="bi-sweep"></div>' +
    '<div class="bi-bar"><div class="bi-fill"></div></div>' +
    '<div class="bi-meta"><span class="bi-stage">RESOLVING DNS</span><span class="bi-pct">0</span></div>' +
    "</div>";
  const q = <T extends HTMLElement>(s: string) => root.querySelector(s) as T;
  const word = q<HTMLElement>(".bi-word");
  const fill = q<HTMLElement>(".bi-fill");
  const pct = q<HTMLElement>(".bi-pct");
  const stage = q<HTMLElement>(".bi-stage");
  const sweep = q<HTMLElement>(".bi-sweep");
  word.textContent = WORDMARK;

  let killed = false;
  const state = { p: 0 };
  const tl = gsap.timeline();
  tl.to(state, {
    p: 100,
    duration: 1.2,
    ease: "power1.inOut",
    onUpdate: () => {
      const v = Math.round(state.p);
      fill.style.width = v + "%";
      pct.textContent = String(v);
      stage.textContent = STAGES[Math.min(STAGES.length - 1, Math.floor((v / 100) * STAGES.length))];
    },
  });
  tl.add(() => scramble(word, WORDMARK, 0.9), "-=0.15");
  tl.fromTo(sweep, { scaleX: 0, opacity: 0 }, { scaleX: 1, opacity: 1, duration: 0.5, ease: "power2.out" }, "-=0.75");
  tl.to(sweep, { opacity: 0, duration: 0.3 }, "+=0.2");

  function scramble(node: HTMLElement, text: string, dur: number) {
    const start = performance.now();
    const total = dur * 1000;
    const step = () => {
      if (killed) {
        node.textContent = text;
        return;
      }
      const t = Math.min(1, (performance.now() - start) / total);
      const revealed = Math.floor(t * text.length);
      let out = "";
      for (let i = 0; i < text.length; i++) {
        out += i < revealed || text[i] === " " ? text[i] : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      node.textContent = out;
      if (t < 1) requestAnimationFrame(step);
      else node.textContent = text;
    };
    step();
  }

  const done = new Promise<void>((resolve) => {
    tl.add(() => resolve(), "+=0.1");
  });
  return { done, cleanup: () => { killed = true; tl.kill(); } };
}

export const terminalBoot: IntroVariation = {
  id: "terminal",
  tier: "css",
  eligible: () => true,
  weight: () => 1,
  run,
};
