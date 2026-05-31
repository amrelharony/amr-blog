"use client";
import type { IntroCtx, IntroRun, IntroVariation } from "../types";
import { WORDMARK } from "../types";

// Variation: "Data Cinema" — self-contained SVG + SMIL. Two scenes inspired by the main
// site's data-intro.js: GYRO (rotating elliptical rings + pulsing core) and LATTICE
// (procedural hex grid revealed by a distance-staggered scan wave). Phase picks the scene.
function glowDefs(): string {
  return (
    '<defs><filter id="idc-glow" x="-50%" y="-50%" width="200%" height="200%">' +
    '<feGaussianBlur stdDeviation="2.4"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>' +
    "</filter></defs>"
  );
}

function gyro(W: number, H: number, c: { accent: string; accent2: string; accent3: string }): string {
  const cx = W / 2,
    cy = H / 2,
    b = Math.min(W, H) * 0.16;
  const rings = [
    { rx: b * 2.3, ry: b * 0.85, dur: 14, dir: 1, col: c.accent, dash: "" },
    { rx: b * 0.85, ry: b * 2.1, dur: 18, dir: -1, col: c.accent2, dash: "2 7" },
    { rx: b * 1.6, ry: b * 1.6, dur: 10, dir: 1, col: c.accent3, dash: "" },
    { rx: b * 2.7, ry: b * 1.25, dur: 22, dir: -1, col: c.accent, dash: "3 6" },
    { rx: b * 1.25, ry: b * 2.7, dur: 16, dir: 1, col: c.accent2, dash: "" },
  ];
  let s = "";
  rings.forEach((r, i) => {
    s +=
      `<g style="transform-origin:${cx}px ${cy}px"><ellipse cx="${cx}" cy="${cy}" rx="${r.rx}" ry="${r.ry}" ` +
      `fill="none" stroke="${r.col}" stroke-width="1.4" stroke-opacity="0" ${r.dash ? `stroke-dasharray="${r.dash}"` : ""} filter="url(#idc-glow)">` +
      `<animate attributeName="stroke-opacity" from="0" to="0.75" begin="${(i * 0.1).toFixed(2)}s" dur="0.8s" fill="freeze"/>` +
      `<animateTransform attributeName="transform" type="rotate" from="0 ${cx} ${cy}" to="${r.dir * 360} ${cx} ${cy}" dur="${r.dur}s" repeatCount="indefinite"/>` +
      `</ellipse></g>`;
  });
  // core
  s +=
    `<circle cx="${cx}" cy="${cy}" r="${b * 0.28}" fill="none" stroke="${c.accent}" stroke-width="1" stroke-opacity="0" filter="url(#idc-glow)">` +
    `<animate attributeName="stroke-opacity" from="0" to="0.9" begin="0.4s" dur="0.6s" fill="freeze"/>` +
    `<animateTransform attributeName="transform" type="rotate" from="360 ${cx} ${cy}" to="0 ${cx} ${cy}" dur="8s" repeatCount="indefinite"/></circle>`;
  s +=
    `<circle cx="${cx}" cy="${cy}" r="6" fill="${c.accent}" filter="url(#idc-glow)" opacity="0">` +
    `<animate attributeName="opacity" from="0" to="1" begin="0.5s" dur="0.5s" fill="freeze"/>` +
    `<animate attributeName="r" values="6;13;6" dur="1.8s" begin="0.5s" repeatCount="indefinite"/></circle>`;
  return s;
}

function lattice(W: number, H: number, desktop: boolean, c: { accent: string; accent2: string; accent3: string }): string {
  const hr = Math.min(W, H) * (desktop ? 0.05 : 0.07);
  const dx = hr * 1.5,
    dy = hr * Math.sqrt(3);
  const cx = W / 2,
    cy = H / 2;
  const maxDist = Math.hypot(W, H) / 2;
  const hexPts = (x: number, y: number) => {
    let p = "";
    for (let k = 0; k < 6; k++) {
      const ang = (Math.PI / 180) * (60 * k);
      p += `${(x + hr * Math.cos(ang)).toFixed(1)},${(y + hr * Math.sin(ang)).toFixed(1)} `;
    }
    return p.trim();
  };
  let s = "";
  let col = 0;
  const cap = desktop ? 170 : 80;
  let n = 0;
  for (let x = hr; x < W + hr; x += dx, col++) {
    const yo = col % 2 ? dy / 2 : 0;
    for (let y = hr + yo; y < H + hr; y += dy) {
      if (n >= cap) break;
      const dist = Math.hypot(x - cx, y - cy);
      const delay = (dist / maxDist) * 0.9;
      const op = (0.6 - (dist / maxDist) * 0.45).toFixed(2);
      s +=
        `<polygon points="${hexPts(x, y)}" fill="${c.accent2}" fill-opacity="0" stroke="${c.accent}" stroke-opacity="0" stroke-width="1">` +
        `<animate attributeName="stroke-opacity" from="0" to="${op}" begin="${delay.toFixed(2)}s" dur="0.5s" fill="freeze"/>` +
        `<animate attributeName="fill-opacity" from="0" to="0.05" begin="${delay.toFixed(2)}s" dur="0.5s" fill="freeze"/></polygon>`;
      n++;
    }
  }
  // central hex (2.4x) + scan ring
  let bigPts = "";
  for (let k = 0; k < 6; k++) {
    const ang = (Math.PI / 180) * (60 * k);
    bigPts += `${(cx + hr * 2.4 * Math.cos(ang)).toFixed(1)},${(cy + hr * 2.4 * Math.sin(ang)).toFixed(1)} `;
  }
  s +=
    `<polygon points="${bigPts.trim()}" fill="${c.accent}" fill-opacity="0" stroke="${c.accent3}" stroke-width="2" stroke-opacity="0" filter="url(#idc-glow)">` +
    `<animate attributeName="stroke-opacity" values="0;0.9;0.4;0.7" begin="1s" dur="2.4s" fill="freeze"/>` +
    `<animate attributeName="fill-opacity" values="0;0.08;0.03" begin="1s" dur="2.4s" fill="freeze"/></polygon>`;
  s +=
    `<circle cx="${cx}" cy="${cy}" r="0" fill="none" stroke="${c.accent}" stroke-width="1.5" stroke-dasharray="6 8" filter="url(#idc-glow)">` +
    `<animate attributeName="r" from="0" to="${maxDist}" dur="1s" fill="freeze"/>` +
    `<animate attributeName="stroke-opacity" from="0.8" to="0" dur="1s" fill="freeze"/></circle>`;
  return s;
}

function run(ctx: IntroCtx): IntroRun {
  const { root, pal, phase, desktop } = ctx;
  const W = window.innerWidth,
    H = window.innerHeight;
  const c = { accent: pal.accent, accent2: pal.accent2, accent3: pal.accent3 };
  const useLattice = phase === "night" || phase === "evening" || phase === "dusk";
  const body = useLattice ? lattice(W, H, desktop, c) : gyro(W, H, c);

  const wrap = document.createElement("div");
  wrap.className = "intro-root-fill";
  wrap.innerHTML =
    `<svg class="intro-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">` +
    glowDefs() +
    body +
    "</svg>" +
    `<div class="intro-stage"><div class="bi-word" style="opacity:0;transition:opacity .8s ease">${WORDMARK}</div></div>`;
  root.appendChild(wrap);
  const word = wrap.querySelector(".bi-word") as HTMLElement;
  const tWord = setTimeout(() => { word.style.opacity = "1"; }, 1100);

  const done = new Promise<void>((resolve) => setTimeout(resolve, 3000));
  return {
    done,
    cleanup: () => {
      clearTimeout(tWord);
      wrap.remove();
    },
  };
}

export const svgDataCinema: IntroVariation = {
  id: "svg",
  tier: "svg",
  eligible: () => typeof document !== "undefined",
  weight: (ctx) => (ctx.phase === "night" || ctx.phase === "dusk" ? 1.4 : 1),
  run,
};
