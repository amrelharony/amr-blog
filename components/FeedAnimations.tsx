"use client";
import { useEffect } from "react";
import * as A from "@/lib/gsap-anim";

export default function FeedAnimations() {
  useEffect(() => {
    const wrap = document.querySelector(".lb-wrap") as HTMLElement | null;
    if (!wrap) return;
    if (!A.gsapOk()) {
      A.fallbackReveal();
      return;
    }
    A.addGsapActive();
    A.feedEntrance(wrap);
    A.scrollReveals(wrap);
    const hero = wrap.querySelector(".lb-hero") as HTMLElement | null;
    if (hero) A.heroParallax(hero);
    wrap.querySelectorAll(".lb-card-v2").forEach((c) => A.cardMicro(c as HTMLElement));
    return () => A.killScrollTriggers();
  }, []);
  return null;
}
