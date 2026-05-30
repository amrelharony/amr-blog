"use client";
import { useEffect } from "react";
import { gsap } from "gsap";
import { haptic } from "@/lib/haptics";
import { ensureAnonSession } from "@/lib/supabase/anon";

// 3D mascot (full Three.js) — loads the verbatim main-site modules from public/:
//   askamr-api.js (chat contract) → ai3d-core.js (window._AI3D) → mascot-assistant.js
// against three r128 globals (loaded by the modules from CDN). Heavy + 16 MB GLB, so it
// is gated to desktop + non-reduced-motion and deferred to idle time. Emoji fallback is
// built into mascot-assistant.js (on reduced-motion or load failure).
const SCRIPTS = ["/askamr-api.js", "/ai3d-core.js", "/mascot-assistant.js"];

type MascotWindow = Window & {
  __mascotBooted?: boolean;
  gsap?: unknown;
  _haptic?: unknown;
  _peripheralsShown?: boolean;
  autoDismiss3D?: (...a: unknown[]) => void;
  cancelAutoDismiss?: (...a: unknown[]) => void;
  _ensureChatAuth?: () => Promise<string | null>;
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
};

export default function Mascot() {
  useEffect(() => {
    // Guards: desktop pointer, wide viewport, motion allowed.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(pointer:fine)").matches) return;
    if (window.innerWidth < 900) return;

    const w = window as MascotWindow;
    if (w.__mascotBooted || document.getElementById("mascot-assistant-script")) return;
    w.__mascotBooted = true;

    // Shims the verbatim modules expect (audio globals are intentionally absent → guarded no-op).
    w.gsap = w.gsap || gsap;
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
    idle(() => loadSeq(0));
  }, []);

  return null;
}
