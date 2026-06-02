"use client";
// Spatial UI audio ("music engine") — ported from Js/spatial-audio.js. Web Audio
// synthesized hover/click/overlay tones, gesture-gated, with an on/off toggle.
// Default ON, but respects an explicit mute (audio_enabled="0"); sound still can't play
// until the first user gesture (browser autoplay policy).

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let gesture = false;
let enabled = false;
let inited = false;

function readEnabled(): boolean {
  // Default ON: only off if the visitor explicitly muted it ("0").
  // (Sound still can't play until the first user gesture — browser autoplay policy.)
  try {
    return localStorage.getItem("audio_enabled") !== "0";
  } catch {
    return true;
  }
}

function getCtx(): AudioContext | null {
  if (!gesture || !enabled) return null;
  if (!ctx) {
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  if (ctx && ctx.state === "suspended") ctx.resume();
  return ctx;
}

export function blip(freq: number, duration: number, panVal = 0, type: OscillatorType = "sine", vol = 0.06) {
  const c = getCtx();
  if (!c || !master) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  const pan = c.createStereoPanner();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime);
  gain.gain.setValueAtTime(vol, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
  pan.pan.setValueAtTime(Math.max(-1, Math.min(1, panVal)), c.currentTime);
  osc.connect(gain).connect(pan).connect(master);
  osc.start(c.currentTime);
  osc.stop(c.currentTime + duration);
}

export function sweep(startFreq: number, endFreq: number, duration: number, panVal = 0) {
  const c = getCtx();
  if (!c || !master) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  const pan = c.createStereoPanner();
  osc.type = "sine";
  osc.frequency.setValueAtTime(startFreq, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(endFreq, c.currentTime + duration);
  gain.gain.setValueAtTime(0.05, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
  pan.pan.setValueAtTime(Math.max(-1, Math.min(1, panVal)), c.currentTime);
  osc.connect(gain).connect(pan).connect(master);
  osc.start(c.currentTime);
  osc.stop(c.currentTime + duration);
}

export function isEnabled() {
  return enabled;
}
export function setEnabled(on: boolean): boolean {
  enabled = on;
  try {
    localStorage.setItem("audio_enabled", on ? "1" : "0");
  } catch {}
  if (on) blip(800, 0.05, 0, "sine", 0.06);
  return enabled;
}

const INTERACTIVE =
  "button, a[href], .lb-card-v2, .lb-hero, .lb-tag-chip, .blog-post, .lb-rx-btn, .blog-reaction-btn, .sc-btn, .ch-tab, .blog-filter-btn, .lb-continue-card, .adm-btn";

export function initAudio() {
  if (inited || typeof window === "undefined") return;
  inited = true;
  enabled = readEnabled();

  const markGesture = () => {
    gesture = true;
    document.removeEventListener("click", markGesture, true);
    document.removeEventListener("touchstart", markGesture, true);
    document.removeEventListener("keydown", markGesture, true);
  };
  document.addEventListener("click", markGesture, { capture: true, once: true });
  document.addEventListener("touchstart", markGesture, { capture: true, once: true });
  document.addEventListener("keydown", markGesture, { capture: true, once: true });

  document.body.addEventListener(
    "mouseenter",
    (e) => {
      if (!enabled) return;
      const el = (e.target as HTMLElement)?.closest?.(INTERACTIVE);
      if (!el) return;
      const panVal = (e.clientX / window.innerWidth) * 2 - 1;
      const yNorm = 1 - e.clientY / window.innerHeight;
      blip(2200 + yNorm * 1800, 0.035, panVal, "sine", 0.045);
    },
    true,
  );

  document.body.addEventListener(
    "click",
    (e) => {
      if (!enabled) return;
      const el = (e.target as HTMLElement)?.closest?.(INTERACTIVE);
      if (!el) return;
      const panVal = (e.clientX / window.innerWidth) * 2 - 1;
      blip(1400, 0.02, panVal, "square", 0.03);
      setTimeout(() => blip(1800, 0.02, panVal, "square", 0.03), 25);
    },
    true,
  );
}
