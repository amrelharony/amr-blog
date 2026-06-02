"use client";
import { useEffect } from "react";
import * as A from "@/lib/gsap-anim";

// `slug` keys the effect so it re-runs when navigating article→article (the App
// Router reuses this component instance across /p/[slug] changes, so a bare []
// dep would leave the 2nd article un-animated).
export default function ArticleAnimations({ slug }: { slug: string }) {
  useEffect(() => {
    const article = document.querySelector(".lb-article") as HTMLElement | null;
    if (!article) return;
    if (!A.gsapOk()) {
      A.fallbackReveal();
      return;
    }
    A.addGsapActive();
    A.articleEntrance(article);
    const content = document.querySelector(".lb-content") as HTMLElement | null;
    if (content) A.articleScrollReveals(content);
    const brand = document.querySelector(".lb-nav-brand") as HTMLElement | null;
    if (brand) A.scrambleBrand(brand, "AMR ELHARONY");
    return () => A.killScrollTriggers();
  }, [slug]);
  return null;
}
