"use client";
// Spatial UI audio ("music engine") — ported from Js/spatial-audio.js. Web Audio
// synthesized hover/click/overlay tones, gesture-gated, with an on/off toggle.
// Default ON (respect explicit mute): sound is enabled unless the visitor muted it,
// but browser autoplay policy still keeps it silent until the first user gesture.

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

// ── Mascot synth bridge (window._sono / window._spatialAudio) ──────────────
// mascot-assistant.js (verbatim from the main site) renders every mascot sound
// through window._sono and gates/pans via window._spatialAudio. The blog never
// defined these, so the mascot was silent. We rebuild them on the SAME context,
// gesture gate and on/off toggle as the UI sounds above, so one button controls
// everything. Method signatures match exactly what mascot-assistant.js calls.

function clampPan(p: number): number {
  return Math.max(-1, Math.min(1, p || 0));
}

// Basic note: single oscillator with a soft attack + exponential decay.
function note(freq: number, type: OscillatorType, duration: number, vol: number, panVal = 0) {
  const c = getCtx();
  if (!c || !master) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  const pan = c.createStereoPanner();
  const t = c.currentTime;
  osc.type = type || "sine";
  osc.frequency.setValueAtTime(freq, t);
  pan.pan.setValueAtTime(clampPan(panVal), t);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain).connect(pan).connect(master);
  osc.start(t);
  osc.stop(t + duration + 0.03);
}

// Bell-like chime: fundamental + a quiet, slightly detuned octave overtone.
function chimeAt(startFreq: number, endFreq: number, duration: number, vol: number, panVal = 0) {
  const c = getCtx();
  if (!c || !master) return;
  const gain = c.createGain();
  const pan = c.createStereoPanner();
  const over = c.createGain();
  const o1 = c.createOscillator();
  const o2 = c.createOscillator();
  const t = c.currentTime;
  o1.type = "sine";
  o2.type = "sine";
  o1.frequency.setValueAtTime(startFreq, t);
  o2.frequency.setValueAtTime(startFreq * 2.01, t);
  if (endFreq !== startFreq) {
    o1.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t + duration);
    o2.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq * 2.01), t + duration);
  }
  over.gain.setValueAtTime(0.3, t);
  pan.pan.setValueAtTime(clampPan(panVal), t);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  o1.connect(gain);
  o2.connect(over).connect(gain);
  gain.connect(pan).connect(master);
  o1.start(t);
  o2.start(t);
  o1.stop(t + duration + 0.05);
  o2.stop(t + duration + 0.05);
}

function chime(freq: number, duration: number, vol: number, panVal = 0) {
  chimeAt(freq, freq, duration, vol, panVal);
}
function chimeSweep(startFreq: number, endFreq: number, duration: number, vol: number, panVal = 0) {
  chimeAt(startFreq, endFreq, duration, vol, panVal);
}

// Pitch sweep with explicit oscillator type (used for scroll/open sonification).
function sonoSweep(startFreq: number, endFreq: number, duration: number, type: OscillatorType, vol: number) {
  const c = getCtx();
  if (!c || !master) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  const t = c.currentTime;
  osc.type = type || "sine";
  osc.frequency.setValueAtTime(startFreq, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t + duration);
  gain.gain.setValueAtTime(Math.max(0.0002, vol), t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain).connect(master);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

type SonoDrone = {
  setVol(v: number): void;
  setFilter(f: number): void;
  setFreq(f: number): void;
  setPan(p: number): void;
  stop(fade?: number): void;
};

// Sustained, low-pass-filtered drone for the mascot's mood/proximity ambience.
// Returns a handle the mascot ramps every frame; null when audio is gated off.
function droneFiltered(
  freq: number,
  type: OscillatorType,
  vol: number,
  filterFreq: number,
  panVal = 0,
): SonoDrone | null {
  const c = getCtx();
  if (!c || !master) return null;
  const osc = c.createOscillator();
  const filt = c.createBiquadFilter();
  const gain = c.createGain();
  const pan = c.createStereoPanner();
  const t = c.currentTime;
  osc.type = type || "sine";
  osc.frequency.setValueAtTime(Math.max(20, freq), t);
  filt.type = "lowpass";
  filt.frequency.setValueAtTime(Math.max(20, filterFreq), t);
  pan.pan.setValueAtTime(clampPan(panVal), t);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 1.5);
  osc.connect(filt).connect(gain).connect(pan).connect(master);
  osc.start(t);
  let stopped = false;
  return {
    setVol(v) {
      try {
        gain.gain.setTargetAtTime(Math.max(0.0001, v), c.currentTime, 0.1);
      } catch {}
    },
    setFilter(f) {
      try {
        filt.frequency.setTargetAtTime(Math.max(20, f), c.currentTime, 0.1);
      } catch {}
    },
    setFreq(f) {
      try {
        osc.frequency.setTargetAtTime(Math.max(20, f), c.currentTime, 0.05);
      } catch {}
    },
    setPan(p) {
      try {
        pan.pan.setTargetAtTime(clampPan(p), c.currentTime, 0.1);
      } catch {}
    },
    stop(fade = 0.3) {
      if (stopped) return;
      stopped = true;
      try {
        const now = c.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + fade);
        osc.stop(now + fade + 0.05);
      } catch {}
    },
  };
}

function panFromElement(el: Element): number {
  try {
    const r = el.getBoundingClientRect();
    return clampPan(((r.left + r.width / 2) / window.innerWidth) * 2 - 1);
  } catch {
    return 0;
  }
}

type MascotAudioWindow = Window & {
  _sono?: {
    note: typeof note;
    chime: typeof chime;
    chimeSweep: typeof chimeSweep;
    sweep: typeof sonoSweep;
    droneFiltered: typeof droneFiltered;
  };
  _spatialAudio?: { isEnabled: () => boolean; panFromElement: (el: Element) => number };
};

export function isEnabled() {
  return enabled;
}
export function setEnabled(on: boolean): boolean {
  enabled = on;
  try {
    localStorage.setItem("audio_enabled", on ? "1" : "0");
  } catch {}
  // Mute the shared master so any sustained mascot drones go silent immediately
  // (toggling `enabled` alone only stops NEW sounds, not ones already playing).
  if (master && ctx) {
    try {
      master.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.05);
    } catch {}
  }
  if (on) blip(800, 0.05, 0, "sine", 0.06);
  return enabled;
}

const INTERACTIVE =
  "button, a[href], .lb-card-v2, .lb-hero, .lb-tag-chip, .blog-post, .lb-rx-btn, .blog-reaction-btn, .sc-btn, .ch-tab, .blog-filter-btn, .lb-continue-card, .adm-btn";

export function initAudio() {
  if (inited || typeof window === "undefined") return;
  inited = true;
  enabled = readEnabled();

  // Expose the mascot audio bridge (mascot-assistant.js reads these globals).
  const w = window as MascotAudioWindow;
  w._sono = { note, chime, chimeSweep, sweep: sonoSweep, droneFiltered };
  w._spatialAudio = { isEnabled, panFromElement };

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
