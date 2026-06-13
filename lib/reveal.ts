// GSAP-free reveal helpers. Kept out of lib/gsap-anim so reduced-motion
// visitors (and error paths) never download the gsap chunk at all.

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Fallback when GSAP is unavailable / reduced-motion: just reveal everything. */
export function fallbackReveal(root: ParentNode = document) {
  root
    .querySelectorAll(".lb-reveal, .lb-reveal-left")
    .forEach((el) => el.classList.add("visible"));
}
