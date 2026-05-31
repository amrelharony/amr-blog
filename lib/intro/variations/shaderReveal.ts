"use client";
import type { IntroCtx, IntroRun, IntroVariation } from "../types";
import { WORDMARK, hexToRgb01 } from "../types";

// Variation: "shader reveal" — WebGL2 fullscreen fragment shader (accent-tinted plasma +
// inward-sweeping tunnel rings) with the wordmark fading in over it. Raw WebGL2, no deps.
const VERT = `#version 300 es
in vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes; uniform float uTime; uniform float uProg; uniform vec3 uAccent; uniform float uSeed;
out vec4 o;
void main(){
  vec2 uv = (gl_FragCoord.xy*2.0 - uRes) / min(uRes.x, uRes.y);
  float t = uTime*0.6 + uSeed*10.0;
  float r = length(uv) + 1e-3;
  float a = atan(uv.y, uv.x);
  float tun = 0.35/r + t;
  float swirl = a*3.0 + sin(t*0.7)*2.0;
  float p = sin(tun*6.0 + swirl) + 0.5*sin(uv.x*5.0 + t*1.3) + 0.5*sin(uv.y*5.0 - t*1.1) + sin((uv.x+uv.y)*4.0 + t);
  float v = 0.5 + 0.5*sin(p*1.5);
  float rings = 0.5 + 0.5*sin(1.0/r*5.0 - t*3.0);
  vec3 col = uAccent * pow(v, 1.6) + uAccent * 0.4 * pow(rings, 3.0) + vec3(0.02,0.03,0.05);
  float reveal = smoothstep(0.0, 1.0, uProg);
  col *= mix(0.0, 1.3, reveal);
  col *= smoothstep(1.7, 0.2, r);
  o = vec4(col, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return s;
}

function run(ctx: IntroCtx): IntroRun {
  const { root, pal } = ctx;
  const dpr = Math.min(1.5, window.devicePixelRatio || 1);
  const W = window.innerWidth;
  const H = window.innerHeight;

  const canvas = document.createElement("canvas");
  canvas.className = "intro-canvas";
  canvas.width = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);
  root.appendChild(canvas);

  const stage = document.createElement("div");
  stage.className = "intro-stage";
  stage.innerHTML = `<div class="bi-word">${WORDMARK}</div>`;
  stage.style.opacity = "0";
  stage.style.transition = "opacity .8s ease";
  root.appendChild(stage);

  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "high-performance" });
  let killed = false;
  let raf = 0;

  // Fallback: if GL unavailable, just show the wordmark briefly.
  if (!gl) {
    stage.style.opacity = "1";
    return { done: new Promise((r) => setTimeout(r, 1200)), cleanup: () => { killed = true; canvas.remove(); stage.remove(); } };
  }

  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  gl.useProgram(prog);

  // fullscreen triangle
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(prog, "uRes");
  const uTime = gl.getUniformLocation(prog, "uTime");
  const uProg = gl.getUniformLocation(prog, "uProg");
  const uAccent = gl.getUniformLocation(prog, "uAccent");
  const uSeed = gl.getUniformLocation(prog, "uSeed");
  const accent = hexToRgb01(pal.accent);
  const seed = Math.random();
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.uniform2f(uRes, canvas.width, canvas.height);
  gl.uniform3f(uAccent, accent[0], accent[1], accent[2]);
  gl.uniform1f(uSeed, seed);

  setTimeout(() => { if (!killed) stage.style.opacity = "1"; }, 500);

  const t0 = performance.now();
  const DUR = 2300;
  const tick = () => {
    if (killed) return;
    const el = performance.now() - t0;
    gl.uniform1f(uTime, el / 1000);
    gl.uniform1f(uProg, Math.min(1, el / 900));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  const done = new Promise<void>((resolve) => setTimeout(resolve, DUR));
  return {
    done,
    cleanup: () => {
      killed = true;
      cancelAnimationFrame(raf);
      try { gl.getExtension("WEBGL_lose_context")?.loseContext(); } catch {}
      canvas.remove();
      stage.remove();
    },
  };
}

export const shaderReveal: IntroVariation = {
  id: "shader",
  tier: "webgl",
  eligible: (ctx) => ctx.webgl2 && ctx.desktop,
  weight: (ctx) => (ctx.phase === "night" || ctx.phase === "dusk" || ctx.phase === "evening" ? 1.6 : 1.1),
  run,
};
