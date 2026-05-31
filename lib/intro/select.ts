"use client";
import type { IntroCtx, IntroVariation } from "./types";
import { terminalBoot } from "./variations/terminalBoot";
import { particleBuild } from "./variations/particleBuild";
import { shaderReveal } from "./variations/shaderReveal";
import { svgDataCinema } from "./variations/svgDataCinema";

const ALL: IntroVariation[] = [shaderReveal, svgDataCinema, particleBuild, terminalBoot];
const LS = "intro_last";

// Smart adaptive pick: capability gate → time/weather weighting → no immediate repeat.
// ?intro=<id> forces a specific variation (dev/testing).
export function selectVariation(ctx: IntroCtx): IntroVariation {
  let forced: string | null = null;
  try {
    forced = new URLSearchParams(location.search).get("intro");
  } catch {}
  if (forced) {
    const f = ALL.find((v) => v.id === forced);
    if (f) return f;
  }

  const eligible = ALL.filter((v) => {
    try {
      return v.eligible(ctx);
    } catch {
      return false;
    }
  });
  if (!eligible.length) return terminalBoot;

  let last: string | null = null;
  try {
    last = sessionStorage.getItem(LS);
  } catch {}
  let pool = eligible.filter((v) => v.id !== last);
  if (!pool.length) pool = eligible;

  const weights = pool.map((v) => {
    try {
      return Math.max(0.01, v.weight(ctx));
    } catch {
      return 1;
    }
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  let pick = pool[0];
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) {
      pick = pool[i];
      break;
    }
  }
  try {
    sessionStorage.setItem(LS, pick.id);
  } catch {}
  return pick;
}
