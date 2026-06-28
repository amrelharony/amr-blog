// Multi-variation intro engine — shared contract.
// Each variation draws into `root` (a full-bleed container inside the #blog-intro overlay),
// resolves `done` when the visual is ready to wipe, and exposes `cleanup()` to stop loops /
// free GPU contexts / remove nodes. The shell (components/Intro.tsx) owns the overlay,
// reduced-motion skip, skip handlers, safety timeout, clip-path wipe, and blog:intro-done.
import type { Palette, Phase } from "@/lib/weather-palette";

export type Tier = "webgl" | "canvas" | "svg" | "css";

export interface IntroCtx {
  root: HTMLElement;
  pal: Palette;
  phase: Phase;
  weather: { code: number; isDay: boolean } | null;
  desktop: boolean;
  webgl2: boolean;
  light: boolean;
}

export interface IntroRun {
  done: Promise<void>;
  cleanup: () => void;
}

export interface IntroVariation {
  id: string;
  tier: Tier;
  eligible: (ctx: IntroCtx) => boolean;
  weight: (ctx: IntroCtx) => number;
  run: (ctx: IntroCtx) => IntroRun;
}

export const WORDMARK = "FINTECH BILINGUALS";

// "#rrggbb" → [r,g,b] in 0..1 (for WebGL uniforms). Falls back to cyan.
export function hexToRgb01(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || "").trim());
  if (!m) return [0, 0.88, 1];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
