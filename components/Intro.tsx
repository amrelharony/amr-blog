"use client";
import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";

// Lighter custom intro — a staged preloader bar + a signature wordmark scramble with an
// accent sweep, then a clip-path wipe. Plays on every full load (root-layout mount =
// once per hard load, not on soft navigations). Skippable; skipped under reduced-motion.
// SSR-rendered so it covers content from first paint; a <noscript> rule hides it w/o JS.
const STAGES = ["RESOLVING DNS", "ESTABLISHING TLS", "LOADING MODULES", "RENDERING INTERFACE", "READY"];
const WORD = "THE BILINGUAL EXECUTIVE BLOG";
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/\\<>*#";

export default function Intro() {
  const [gone, setGone] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setGone(true);
      return;
    }
    const el = root.current;
    if (!el) return;
    const fill = el.querySelector(".bi-fill") as HTMLElement;
    const pct = el.querySelector(".bi-pct") as HTMLElement;
    const stage = el.querySelector(".bi-stage") as HTMLElement;
    const word = el.querySelector(".bi-word") as HTMLElement;
    const sweep = el.querySelector(".bi-sweep") as HTMLElement;

    let finished = false;
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
    tl.add(() => scramble(word, WORD, 0.9), "-=0.15");
    tl.fromTo(sweep, { scaleX: 0, opacity: 0 }, { scaleX: 1, opacity: 1, duration: 0.5, ease: "power2.out" }, "-=0.75");
    tl.to(sweep, { opacity: 0, duration: 0.3 }, "+=0.2");
    tl.add(() => finish(), "+=0.1");

    function scramble(node: HTMLElement, text: string, dur: number) {
      const start = performance.now();
      const total = dur * 1000;
      const step = () => {
        if (finished) {
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

    function finish() {
      if (finished) return;
      finished = true;
      tl.kill();
      gsap.to(el!, {
        clipPath: "inset(0 0 100% 0)",
        duration: 0.7,
        ease: "power4.inOut",
        onComplete: () => {
          setGone(true);
          window.dispatchEvent(new Event("blog:intro-done"));
        },
      });
    }

    const skip = () => finish();
    window.addEventListener("click", skip);
    window.addEventListener("wheel", skip, { passive: true });
    window.addEventListener("touchstart", skip, { passive: true });
    window.addEventListener("keydown", skip);
    const safety = window.setTimeout(finish, 4500);

    return () => {
      tl.kill();
      window.removeEventListener("click", skip);
      window.removeEventListener("wheel", skip);
      window.removeEventListener("touchstart", skip);
      window.removeEventListener("keydown", skip);
      window.clearTimeout(safety);
    };
  }, []);

  if (gone) return null;
  return (
    <div ref={root} id="blog-intro" aria-hidden="true">
      <div className="bi-inner">
        <div className="bi-word">{WORD}</div>
        <div className="bi-sweep" />
        <div className="bi-bar">
          <div className="bi-fill" />
        </div>
        <div className="bi-meta">
          <span className="bi-stage">RESOLVING DNS</span>
          <span className="bi-pct">0</span>
        </div>
      </div>
    </div>
  );
}
