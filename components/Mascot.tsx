"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { haptic } from "@/lib/haptics";
import { ensureAnonSession } from "@/lib/supabase/anon";

// 3D mascot (full Three.js) — loads the verbatim main-site modules from public/:
//   askamr-api.js (chat contract) → ai3d-core.js (window._AI3D) → mascot-assistant.js
// against three r128 globals (loaded by the modules from CDN). Heavy + 16 MB GLB, so it
// is gated to desktop + non-reduced-motion and deferred to idle time. Emoji fallback is
// built into mascot-assistant.js (on reduced-motion or load failure).
const SCRIPTS = ["/askamr-api.js", "/ai3d-core.js", "/mascot-assistant.js"];

// Article pages at phone/small-tablet width hide the mascot entirely: it parks itself
// over the top-right of the text column, where there is no room to spare and it pulls
// the eye away from the prose. Same cut as the article layout's mobile breakpoint.
const MOBILE_Q = "(max-width: 768px)";
const ARTICLE_PREFIX = "/p/";

type MascotWindow = Window & {
  __mascotBooted?: boolean;
  gsap?: unknown;
  _haptic?: unknown;
  _peripheralsShown?: boolean;
  _suspended?: boolean;
  autoDismiss3D?: (...a: unknown[]) => void;
  cancelAutoDismiss?: (...a: unknown[]) => void;
  _ensureChatAuth?: () => Promise<string | null>;
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
};

// Idempotent: safe to call on every navigation, boots at most once per page load.
function bootMascot() {
  // Load on all viewports + motion preferences so the AI chat is reachable everywhere.
  // mascot-assistant.js self-gates the heavy 16 MB Three.js model: it loads the full 3D
  // mascot only when motion is allowed, and otherwise shows a lightweight emoji launcher
  // (the chat panel works in both cases). Low-memory mobile also skips the 3D internally.
  const w = window as MascotWindow;
  if (w.__mascotBooted || document.getElementById("mascot-assistant-script")) return;
  w.__mascotBooted = true;

  // Shims the verbatim modules expect (audio globals are intentionally absent → guarded no-op).
  w._haptic = w._haptic || haptic;
  w._peripheralsShown = true;
  w.autoDismiss3D = w.autoDismiss3D || (() => {});
  w.cancelAutoDismiss = w.cancelAutoDismiss || (() => {});
  // Chat auth bridge: askamr-api.js awaits this to establish the anon session cookie.
  w._ensureChatAuth = w._ensureChatAuth || (() => ensureAnonSession());

  const loadSeq = (i: number) => {
    if (i >= SCRIPTS.length) return;
    const s = document.createElement("script");
    if (SCRIPTS[i].includes("mascot-assistant")) s.id = "mascot-assistant-script";
    s.src = SCRIPTS[i];
    s.async = false; // preserve order: api → core → mascot
    s.onload = () => loadSeq(i + 1);
    s.onerror = () => console.warn("[Mascot] failed to load", SCRIPTS[i]);
    document.body.appendChild(s);
  };

  const idle = (cb: () => void) =>
    w.requestIdleCallback ? w.requestIdleCallback(cb, { timeout: 3000 }) : window.setTimeout(cb, 1200);
  idle(async () => {
    // gsap is dynamic-imported here (not at module top) so it loads at idle
    // time with the rest of the mascot stack, off the critical path.
    if (!w.gsap) {
      try {
        w.gsap = (await import("gsap")).gsap;
      } catch (e) {
        console.warn("[Mascot] gsap failed to load:", e);
      }
    }
    loadSeq(0);
  });
}

export default function Mascot() {
  const pathname = usePathname();
  // Only ever un-suspend the render loop if we're the ones who suspended it.
  const suspendedByUs = useRef(false);

  useEffect(() => {
    const w = window as MascotWindow;
    const mq = window.matchMedia(MOBILE_Q);
    const isArticle = pathname.startsWith(ARTICLE_PREFIX);

    // Re-evaluated per navigation and whenever the viewport crosses the breakpoint
    // (rotation, desktop resize), so the mascot comes back the moment it has room.
    const apply = () => {
      const hide = isArticle && mq.matches;
      // .mascot-off in globals.css hides the float; the mascot DOM lives outside React
      // (injected by mascot-assistant.js), so a body class is the only handle we have.
      document.body.classList.toggle("mascot-off", hide);
      // Park the WebGL render loop while it's hidden — mascot-assistant.js checks
      // window._suspended every frame, so this spares the GPU/battery on phones.
      if (hide) {
        w._suspended = true;
        suspendedByUs.current = true;
      } else if (suspendedByUs.current) {
        w._suspended = false;
        suspendedByUs.current = false;
      }
      // Deferred boot: a reader landing straight on a mobile article never pays for
      // the Three.js + 16 MB GLB download. It loads if they leave the article or
      // widen the viewport. The chat itself stays reachable via the command palette.
      if (!hide) bootMascot();
    };

    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [pathname]);

  return null;
}
