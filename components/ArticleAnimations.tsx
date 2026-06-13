"use client";
import { useEffect } from "react";
import { fallbackReveal, prefersReducedMotion } from "@/lib/reveal";

// `slug` keys the effect so it re-runs when navigating article→article (the App
// Router reuses this component instance across /p/[slug] changes, so a bare []
// dep would leave the 2nd article un-animated). lib/gsap-anim is loaded via
// dynamic import so gsap stays out of the initial bundle.
export default function ArticleAnimations({ slug }: { slug: string }) {
  useEffect(() => {
    const article = document.querySelector(".lb-article") as HTMLElement | null;
    if (!article) return;
    if (prefersReducedMotion()) {
      fallbackReveal();
      return;
    }

    let cancelled = false;
    let anim: typeof import("@/lib/gsap-anim") | null = null;

    import("@/lib/gsap-anim")
      .then((A) => {
        if (cancelled) return;
        anim = A;
        A.addGsapActive();
        A.articleEntrance(article);
        const content = document.querySelector(".lb-content") as HTMLElement | null;
        if (content) A.articleScrollReveals(content);
        const brand = document.querySelector(".lb-nav-brand") as HTMLElement | null;
        if (brand) A.scrambleBrand(brand, "AMR ELHARONY");
      })
      .catch(() => {
        if (!cancelled) fallbackReveal();
      });

    return () => {
      cancelled = true;
      anim?.killScrollTriggers();
    };
  }, [slug]);
  return null;
}
