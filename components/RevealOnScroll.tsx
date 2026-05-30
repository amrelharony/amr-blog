"use client";
import { useEffect } from "react";

// Minimal port of B._initScrollReveals: adds `.visible` to `.lb-reveal` /
// `.lb-reveal-left` elements as they enter the viewport (above-fold revealed
// immediately). A MutationObserver catches elements added on client navigation.
export default function RevealOnScroll() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const io = reduce
      ? null
      : new IntersectionObserver(
          (entries) => {
            for (const e of entries) {
              if (e.isIntersecting) {
                e.target.classList.add("visible");
                io!.unobserve(e.target);
              }
            }
          },
          { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
        );

    const reveal = (el: Element) => {
      if (reduce) {
        el.classList.add("visible");
        return;
      }
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight) el.classList.add("visible");
      else io!.observe(el);
    };

    const scan = (root: ParentNode) =>
      root.querySelectorAll(".lb-reveal:not(.visible), .lb-reveal-left:not(.visible)").forEach(reveal);

    scan(document);

    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          const el = node as Element;
          if (el.matches(".lb-reveal, .lb-reveal-left")) reveal(el);
          scan(el);
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      io?.disconnect();
      mo.disconnect();
    };
  }, []);

  return null;
}
