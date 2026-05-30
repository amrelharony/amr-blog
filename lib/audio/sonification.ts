"use client";
// UI sonification (subset of Js/sonification.js — no arcade-game modules). Small
// musical cues for key UI events, layered on the spatial-audio engine.
import { blip, sweep } from "./spatial";

export function snd(event: string) {
  switch (event) {
    case "tap":
      blip(1500, 0.02, 0, "sine", 0.04);
      break;
    case "menuOpen":
      sweep(400, 1100, 0.14, 0);
      break;
    case "menuClose":
      sweep(1100, 400, 0.1, 0);
      break;
    case "success":
      blip(523, 0.1, 0, "sine", 0.05);
      setTimeout(() => blip(659, 0.1, 0, "sine", 0.05), 80);
      setTimeout(() => blip(784, 0.14, 0, "sine", 0.045), 160);
      break;
    case "warning":
      blip(330, 0.12, 0, "triangle", 0.05);
      setTimeout(() => blip(262, 0.16, 0, "triangle", 0.05), 90);
      break;
    default:
      blip(1500, 0.02, 0, "sine", 0.04);
  }
}
