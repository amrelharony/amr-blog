"use client";
// Lightweight standalone reading gamification — streak + counts derived from local
// reading history. (The original blog-gamification.js bridged to the portfolio's XP
// engine, which doesn't exist on the standalone blog, so this is a self-contained
// reader-stats version using the same reading-streak logic.)
const STREAK_LS = "_lb_reading_streak";
const HIST_LS = "_lb_reading_history";

interface Streak {
  days: string[];
  streak: number;
}

export function recordReadingDay(): number {
  let s: Streak;
  try {
    s = JSON.parse(localStorage.getItem(STREAK_LS) || '{"days":[],"streak":0}');
  } catch {
    s = { days: [], streak: 0 };
  }
  const today = new Date().toISOString().slice(0, 10);
  if (!s.days.includes(today)) {
    s.days.push(today);
    if (s.days.length > 30) s.days = s.days.slice(-30);
    const sorted = s.days.slice().sort().reverse();
    let streak = 1;
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i - 1] + "T00:00:00Z").getTime();
      const cur = new Date(sorted[i] + "T00:00:00Z").getTime();
      if (Math.round((prev - cur) / 86400000) === 1) streak++;
      else break;
    }
    s.streak = streak;
    try {
      localStorage.setItem(STREAK_LS, JSON.stringify(s));
    } catch {}
  }
  return s.streak;
}

export function getReaderStats(): { streak: number; read: number; completed: number } {
  let h: Record<string, { progress?: number; completed?: boolean }> = {};
  try {
    h = JSON.parse(localStorage.getItem(HIST_LS) || "{}");
  } catch {}
  let s: { streak?: number } = {};
  try {
    s = JSON.parse(localStorage.getItem(STREAK_LS) || "{}");
  } catch {}
  const read = Object.keys(h).filter((k) => (h[k].progress || 0) > 0).length;
  const completed = Object.keys(h).filter((k) => h[k].completed).length;
  return { streak: s.streak || 0, read, completed };
}
