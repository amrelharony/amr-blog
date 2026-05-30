"use client";
// Haptic feedback engine — ported from Js/haptics.js (navigator.vibrate).
type Pattern = number | number[];

function blocked(): boolean {
  if (typeof navigator === "undefined" || !navigator.vibrate) return true;
  if (typeof document !== "undefined" && document.body.classList.contains("perf-critical")) return true;
  return false;
}
function fire(pattern: Pattern) {
  if (blocked()) return;
  try {
    navigator.vibrate(pattern);
  } catch {}
}

export const haptic = {
  tap: () => fire(3),
  toggle: () => fire([3, 20, 3]),
  menuOpen: () => fire([3, 15, 5]),
  menuClose: () => fire(3),
  swipe: () => fire([4, 12, 4]),
  cardPress: () => fire(4),
  cardFlip: () => fire([3, 25, 5]),
  expand: () => fire([3, 15, 5]),
  collapse: () => fire(3),
  notify: () => fire([4, 20, 6]),
  milestone: () => fire([4, 20, 4, 20, 6]),
  xp: () => fire(4),
  heartbeat: () => fire([4, 40, 4]),
  rotate: () => fire(3),
  sectionSnap: () => fire([2, 10, 2]),
  success: () => fire([6, 30, 6, 30, 10]),
  warning: () => fire([15, 30, 25]),
  levelUp: () => fire([8, 30, 8, 30, 8, 30, 12, 50, 15]),
  trophy: () => fire([10, 25, 10, 25, 20]),
  enter: () => fire([4, 15, 4, 15, 4, 15, 8, 30, 12]),
  raw: fire,
};
