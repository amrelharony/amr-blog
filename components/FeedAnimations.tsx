"use client";
import { useEffect } from "react";
import { fallbackReveal, prefersReducedMotion } from "@/lib/reveal";

// Feed entrance + scroll reveals. lib/gsap-anim is loaded via dynamic import
// so gsap stays out of the initial bundle; reduced-motion visitors never
// download it at all. Also listens for FeedLoadMore's "feed:more" event to
// reveal freshly appended cards (scrollReveals/cardMicro are idempotent —
// they skip .gsap-revealed / _gsapMicro nodes).
export default function FeedAnimations() {
  useEffect(() => {
    const wrap = document.querySelector(".lb-wrap") as HTMLElement | null;
    if (!wrap) return;

    if (prefersReducedMotion()) {
      fallbackReveal();
      const onMore = () => fallbackReveal(wrap);
      window.addEventListener("feed:more", onMore);
      return () => window.removeEventListener("feed:more", onMore);
    }

    let cancelled = false;
    let anim: typeof import("@/lib/gsap-anim") | null = null;

    const onMore = () => {
      if (anim) {
        anim.scrollReveals(wrap);
        wrap.querySelectorAll(".lb-card-v2").forEach((c) => anim!.cardMicro(c as HTMLElement));
      } else {
        // Cards appended before the gsap chunk arrives: just show them.
        fallbackReveal(wrap);
      }
    };
    window.addEventListener("feed:more", onMore);

    import("@/lib/gsap-anim")
      .then((A) => {
        if (cancelled) return;
        anim = A;
        A.addGsapActive();
        A.feedEntrance(wrap);
        A.scrollReveals(wrap);
        const hero = wrap.querySelector(".lb-hero") as HTMLElement | null;
        if (hero) A.heroParallax(hero);
        wrap.querySelectorAll(".lb-card-v2").forEach((c) => A.cardMicro(c as HTMLElement));
      })
      .catch(() => {
        if (!cancelled) fallbackReveal();
      });

    return () => {
      cancelled = true;
      window.removeEventListener("feed:more", onMore);
      anim?.killScrollTriggers();
    };
  }, []);
  return null;
}
