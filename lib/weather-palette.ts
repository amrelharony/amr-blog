// Weather → accent palette + time-of-day ambient gradient.
// Ported from Js/emotion-engine.js (MOOD_COLORS + weatherCodeToMood) and
// Js/phase5-experimental.js (PALETTES). Body text is never recolored — only the
// accent/glow CSS vars and a subtle fixed background gradient.

export interface Palette {
  accent: string;
  accent2: string;
  accent3: string;
  glow: string;
  glowS: string;
}

const MOOD_COLORS: Record<string, Palette> = {
  warm: { accent: "#fbbf24", accent2: "#f59e0b", accent3: "#ef4444", glow: "rgba(251,191,36,.35)", glowS: "rgba(251,191,36,.18)" },
  focused: { accent: "#6366f1", accent2: "#818cf8", accent3: "#a78bfa", glow: "rgba(99,102,241,.35)", glowS: "rgba(99,102,241,.18)" },
  surprised: { accent: "#a855f7", accent2: "#c084fc", accent3: "#e879f9", glow: "rgba(168,85,247,.35)", glowS: "rgba(168,85,247,.18)" },
  calm: { accent: "#2dd4bf", accent2: "#5eead4", accent3: "#a7f3d0", glow: "rgba(45,212,191,.35)", glowS: "rgba(45,212,191,.18)" },
  melancholy: { accent: "#60a5fa", accent2: "#93c5fd", accent3: "#a5b4fc", glow: "rgba(96,165,250,.35)", glowS: "rgba(96,165,250,.18)" },
  serene: { accent: "#94a3b8", accent2: "#cbd5e1", accent3: "#a5b4fc", glow: "rgba(148,163,184,.35)", glowS: "rgba(148,163,184,.18)" },
  intense: { accent: "#ef4444", accent2: "#f87171", accent3: "#fb923c", glow: "rgba(239,68,68,.4)", glowS: "rgba(239,68,68,.2)" },
  neutral: { accent: "#00e1ff", accent2: "#6366f1", accent3: "#a855f7", glow: "rgba(0,225,255,.15)", glowS: "rgba(0,225,255,.4)" },
  playful: { accent: "#f472b6", accent2: "#fb7185", accent3: "#c084fc", glow: "rgba(244,114,182,.4)", glowS: "rgba(244,114,182,.2)" },
  determined: { accent: "#f59e0b", accent2: "#fbbf24", accent3: "#fb923c", glow: "rgba(245,158,11,.4)", glowS: "rgba(245,158,11,.2)" },
  curious: { accent: "#34d399", accent2: "#6ee7b7", accent3: "#5eead4", glow: "rgba(52,211,153,.35)", glowS: "rgba(52,211,153,.18)" },
};

// WMO weather code → mood (Js/emotion-engine.js:84-102)
function weatherCodeToMood(code: number, isDay: boolean): string {
  code = Number(code);
  if (code === 0) return isDay ? "warm" : "serene";
  if (code === 1) return isDay ? "calm" : "serene";
  if (code === 2) return "neutral";
  if (code === 3) return "melancholy";
  if (code <= 48) return "serene";
  if (code <= 55) return "melancholy";
  if (code <= 57) return "determined";
  if (code <= 63) return "melancholy";
  if (code <= 67) return "intense";
  if (code <= 73) return "serene";
  if (code <= 77) return "curious";
  if (code <= 80) return "playful";
  if (code <= 82) return "intense";
  if (code <= 86) return "surprised";
  return "intense";
}

export function weatherToPalette(code: number, isDay: boolean): Palette {
  return MOOD_COLORS[weatherCodeToMood(code, isDay)] || MOOD_COLORS.neutral;
}

// ── Time-of-day ambient gradient (subtle, static) ──
// Hour-based phase (compact substitute for the SunCalc in phase5-experimental.js).
export type Phase = "dawn" | "morning" | "midday" | "afternoon" | "dusk" | "evening" | "night";

export function getPhase(h = new Date().getHours()): Phase {
  if (h < 5) return "night";
  if (h < 6) return "dawn";
  if (h < 11) return "morning";
  if (h < 15) return "midday";
  if (h < 17) return "afternoon";
  if (h < 19) return "dusk";
  if (h < 21) return "evening";
  return "night";
}

// radial-gradient backgrounds (Js/phase5-experimental.js:36-44)
export const PHASE_BG: Record<Phase, string> = {
  dawn: "radial-gradient(ellipse at 50% 80%, rgba(255,140,50,.05), transparent 70%)",
  morning: "radial-gradient(ellipse at 30% 40%, rgba(255,200,50,.04), transparent 60%)",
  midday: "radial-gradient(ellipse at 50% 30%, rgba(255,255,200,.03), transparent 50%)",
  afternoon: "radial-gradient(ellipse at 70% 50%, rgba(255,160,50,.04), transparent 60%)",
  dusk: "radial-gradient(ellipse at 50% 70%, rgba(255,80,50,.05), rgba(100,0,200,.03) 60%, transparent 80%)",
  evening: "radial-gradient(ellipse at 40% 60%, rgba(60,0,120,.05), transparent 60%)",
  night: "radial-gradient(ellipse at 50% 50%, rgba(0,20,60,.05), transparent 50%)",
};
