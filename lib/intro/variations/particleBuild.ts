"use client";
import type { IntroCtx, IntroRun, IntroVariation } from "../types";
import { WORDMARK } from "../types";

// Variation: "particle build" — Canvas 2D. Particles stream in from the edges and ease into
// the wordmark (target points sampled from rasterized text), hold, then disperse upward.
interface P { x: number; y: number; tx: number; ty: number; vx: number; vy: number; }

// Wrap the wordmark into balanced lines so a long title rasterizes large instead of
// being shrunk to fit one line.
function wrapWordmark(text: string): string[] {
  const words = text.trim().split(/\s+/);
  if (words.length <= 1) return [text];
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
}

function run(ctx: IntroCtx): IntroRun {
  const { root, pal } = ctx;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = window.innerWidth;
  const H = window.innerHeight;

  const canvas = document.createElement("canvas");
  canvas.className = "intro-canvas";
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  root.appendChild(canvas);
  const g = canvas.getContext("2d")!;
  g.scale(dpr, dpr);

  // 1) Rasterize the wordmark to sample target points.
  const off = document.createElement("canvas");
  off.width = W;
  off.height = H;
  const og = off.getContext("2d")!;
  const lines = wrapWordmark(WORDMARK);
  const maxLen = Math.max(...lines.map((l) => l.length));
  const fontSize = Math.max(30, Math.min(ctx.desktop ? 112 : 66, Math.floor(W / (maxLen * 0.64))));
  og.fillStyle = "#fff";
  og.textAlign = "center";
  og.textBaseline = "middle";
  og.font = `700 ${fontSize}px "JetBrains Mono", monospace`;
  const lineH = fontSize * 1.18;
  const startY = H / 2 - ((lines.length - 1) * lineH) / 2;
  lines.forEach((ln, i) => og.fillText(ln, W / 2, startY + i * lineH));
  const img = og.getImageData(0, 0, W, H).data;

  const targets: Array<[number, number]> = [];
  const gap = W < 700 ? 5 : 4;
  for (let y = 0; y < H; y += gap) {
    for (let x = 0; x < W; x += gap) {
      if (img[(y * W + x) * 4 + 3] > 128) targets.push([x, y]);
    }
  }
  // cap point count for perf
  const MAX = ctx.desktop ? 2000 : 950;
  while (targets.length > MAX) targets.splice((Math.random() * targets.length) | 0, 1);

  const parts: P[] = targets.map(([tx, ty]) => {
    const edge = Math.random();
    const sx = edge < 0.5 ? (Math.random() < 0.5 ? -20 : W + 20) : Math.random() * W;
    const sy = edge < 0.5 ? Math.random() * H : Math.random() < 0.5 ? -20 : H + 20;
    return { x: sx, y: sy, tx, ty, vx: 0, vy: 0 };
  });

  const accent = pal.accent || "#00e1ff";
  let raf = 0;
  let killed = false;
  const t0 = performance.now();
  const CONVERGE = 1200,
    HOLD = 600,
    DISPERSE = 600;

  const draw = () => {
    if (killed) return;
    const t = performance.now() - t0;
    g.clearRect(0, 0, W, H);
    g.fillStyle = accent;
    const dispersing = t > CONVERGE + HOLD;
    const dp = dispersing ? Math.min(1, (t - CONVERGE - HOLD) / DISPERSE) : 0;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (!dispersing) {
        p.x += (p.tx - p.x) * 0.09;
        p.y += (p.ty - p.y) * 0.09;
      } else {
        p.y -= 2 + dp * 6;
        p.x += Math.sin((p.tx + t) * 0.01) * 1.2;
      }
      const alpha = dispersing ? 1 - dp : Math.min(1, t / 400);
      g.globalAlpha = alpha;
      g.fillRect(p.x, p.y, 1.6, 1.6);
    }
    g.globalAlpha = 1;
    raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);

  const done = new Promise<void>((resolve) => {
    setTimeout(resolve, CONVERGE + HOLD + DISPERSE - 150);
  });
  return {
    done,
    cleanup: () => {
      killed = true;
      cancelAnimationFrame(raf);
      canvas.remove();
    },
  };
}

export const particleBuild: IntroVariation = {
  id: "particles",
  tier: "canvas",
  eligible: () => typeof document !== "undefined",
  weight: (ctx) => (ctx.phase === "midday" || ctx.phase === "morning" ? 1.4 : 1),
  run,
};
