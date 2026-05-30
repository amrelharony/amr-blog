"use client";
// GSAP blog animations — ported from Js/blog-gsap.js (neutral mood profile; the
// standalone blog has no emotion engine). Client-only; used from animation components.
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

const reduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const gsapOk = () => typeof window !== "undefined" && !reduced();

// Neutral mood profile (MOOD_PROFILES.neutral in the original).
const P = { ds: 1, ease: "power3.out", ss: 1 };

export function addGsapActive() {
  document.body.classList.add("gsap-active");
}
export function removeGsapActive() {
  document.body.classList.remove("gsap-active");
}

/** Fallback when GSAP is unavailable / reduced-motion: just reveal everything. */
export function fallbackReveal(root: ParentNode = document) {
  root
    .querySelectorAll(".lb-reveal, .lb-reveal-left")
    .forEach((el) => el.classList.add("visible"));
}

// ─── Feed entrance ───
export function feedEntrance(wrap: HTMLElement) {
  const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
  const nav = wrap.querySelector(".lb-nav");
  const title = wrap.querySelector(".lb-feed-title");
  const sub = wrap.querySelector(".lb-feed-sub");
  const line = wrap.querySelector(".lb-feed-line");
  const search = wrap.querySelector(".lb-search-wrap");
  const chips = wrap.querySelectorAll(".lb-tag-chip");
  const header = wrap.querySelector(".lb-feed-header");

  if (nav) tl.from(nav, { y: -24, opacity: 0, duration: 0.45 }, 0);
  if (title) tl.from(title, { y: 36, opacity: 0, duration: 0.6, ease: "back.out(1.4)" }, 0.08);
  if (sub) tl.from(sub, { y: 20, opacity: 0, duration: 0.5 }, 0.2);
  if (line) tl.from(line, { scaleX: 0, transformOrigin: "left center", duration: 0.5, ease: "power2.out" }, 0.3);
  if (search) tl.from(search, { y: 24, opacity: 0, scale: 0.97, duration: 0.5 }, 0.25);
  if (chips.length) tl.from(chips, { x: -16, opacity: 0, stagger: 0.04, duration: 0.35 }, 0.35);

  header?.classList.add("gsap-revealed", "visible");
  search?.classList.add("gsap-revealed", "visible");
}

// ─── ScrollTrigger reveals (feed cards / generic) ───
export function scrollReveals(container: HTMLElement) {
  const revealEls = container.querySelectorAll(".lb-reveal:not(.gsap-revealed)");
  const revealLeft = container.querySelectorAll(".lb-reveal-left:not(.gsap-revealed)");
  if (revealEls.length) {
    gsap.set(revealEls, { opacity: 0 });
    ScrollTrigger.batch(revealEls, {
      start: "top 92%",
      onEnter: (batch) =>
        gsap.to(batch, {
          opacity: 1, stagger: 0.09, duration: 0.6, ease: "power2.out",
          onComplete: () => batch.forEach((el) => el.classList.add("gsap-revealed", "visible")),
        }),
      once: true,
    });
  }
  if (revealLeft.length) {
    gsap.set(revealLeft, { opacity: 0, x: -24 });
    ScrollTrigger.batch(revealLeft, {
      start: "top 92%",
      onEnter: (batch) =>
        gsap.to(batch, {
          opacity: 1, x: 0, stagger: 0.06, duration: 0.55, ease: "power3.out",
          onComplete: () => batch.forEach((el) => el.classList.add("gsap-revealed", "visible")),
        }),
      once: true,
    });
  }
}

// ─── Hero parallax ───
export function heroParallax(hero: HTMLElement) {
  const body = hero.querySelector(".lb-hero-body");
  const gradient = hero.querySelector(".lb-hero-gradient");
  if (body)
    gsap.to(body, { y: -20, opacity: 0.6, ease: "none", scrollTrigger: { trigger: hero, start: "center center", end: "bottom top", scrub: 0.4 } });
  if (gradient)
    gsap.to(gradient, { opacity: 0.3, ease: "none", scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: 0.5 } });
}

// ─── Card press / hover micro-interactions ───
export function cardMicro(card: HTMLElement) {
  const c = card as HTMLElement & { _gsapMicro?: boolean };
  if (c._gsapMicro) return;
  c._gsapMicro = true;
  card.addEventListener("pointerdown", () => gsap.to(card, { scale: 0.97, duration: 0.15, ease: "power2.out" }));
  card.addEventListener("pointerup", () => gsap.to(card, { scale: 1, duration: 0.4, ease: "elastic.out(1, 0.4)" }));
  card.addEventListener("pointerleave", () => gsap.to(card, { scale: 1, duration: 0.25, ease: "power2.out", overwrite: true }));
  card.addEventListener("mouseenter", () => gsap.to(card, { boxShadow: "0 6px 28px rgba(0,225,255,.12), inset 0 1px 0 rgba(255,255,255,.06)", duration: 0.3, ease: "power2.out" }));
  card.addEventListener("mouseleave", () => gsap.to(card, { boxShadow: "none", duration: 0.35, ease: "power2.out" }));
}

// ─── Article entrance timeline ───
export function articleEntrance(articleEl: HTMLElement) {
  const tl = gsap.timeline({ defaults: { ease: P.ease } });
  const date = articleEl.querySelector(".lb-article-date") as HTMLElement | null;
  const h1 = articleEl.querySelector(".lb-article-h1") as HTMLElement | null;
  const excerpt = articleEl.querySelector(".lb-article-excerpt") as HTMLElement | null;
  const meta = articleEl.querySelector(".lb-article-meta") as HTMLElement | null;
  const tags = articleEl.querySelectorAll(".lb-card-tag");
  const header = articleEl.querySelector(".lb-article-header") as HTMLElement | null;
  const cover = articleEl.querySelector('.lb-article > img[itemprop="image"]') as HTMLImageElement | null;

  if (date) {
    gsap.set(date, { opacity: 0, clipPath: "inset(0 100% 0 0)", letterSpacing: "6px" });
    tl.to(date, { opacity: 1, clipPath: "inset(0 0% 0 0)", letterSpacing: "normal", duration: 0.6, ease: "power3.out", onComplete: () => gsap.set(date, { clearProps: "clipPath" }) }, 0);
  }
  if (h1) {
    const h1Text = h1.textContent || "";
    h1.innerHTML = h1Text
      .split(/\s+/)
      .map((w) => `<span style="display:inline-block;perspective:600px"><span class="_gsap-word" style="display:inline-block">${w}</span></span>`)
      .join(" ");
    const wordEls = h1.querySelectorAll("._gsap-word");
    gsap.set(wordEls, { opacity: 0, rotationX: -80, transformOrigin: "50% 100%", filter: "blur(6px)", y: 20 });
    gsap.set(h1, { opacity: 1 });
    tl.to(wordEls, { opacity: 1, rotationX: 0, filter: "blur(0px)", y: 0, stagger: 0.04, duration: 0.7, ease: "back.out(1.5)", onComplete: () => { h1.textContent = h1Text; } }, 0.08);
  }
  if (excerpt) {
    gsap.set(excerpt, { opacity: 0, y: 16, filter: "blur(3px)" });
    tl.to(excerpt, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.6, ease: "power2.out" }, 0.25);
  }
  if (meta) {
    const metaChildren = meta.querySelectorAll("span, time, a");
    if (metaChildren.length) {
      gsap.set(metaChildren, { opacity: 0, x: -14, scale: 0.85 });
      tl.to(metaChildren, { opacity: 1, x: 0, scale: 1, stagger: 0.06, duration: 0.4, ease: "elastic.out(1, 0.5)" }, 0.32);
    } else {
      gsap.set(meta, { opacity: 0, y: 10 });
      tl.to(meta, { opacity: 1, y: 0, duration: 0.4 }, 0.32);
    }
  }
  if (tags.length) {
    gsap.set(tags, { opacity: 0, scale: 0.4, rotationZ: -8 });
    tl.to(tags, { opacity: 1, scale: 1, rotationZ: 0, stagger: 0.05, duration: 0.45, ease: "elastic.out(1, 0.4)" }, 0.38);
  }
  if (header) tl.from(header, { borderBottomColor: "transparent", duration: 0.6, ease: "power2.out" }, 0.5);

  if (cover) {
    cover.classList.add("gsap-revealed", "visible");
    gsap.set(cover, { clipPath: "inset(0% 50% 0% 50%)", scale: 1.12, filter: "brightness(1.4) saturate(0.3) blur(4px)", opacity: 0 });
    const reveal = () => {
      const cTl = gsap.timeline({ onComplete: () => gsap.set(cover, { clearProps: "all" }) });
      cTl.to(cover, { opacity: 1, duration: 0.25, ease: "power2.out" }, 0);
      cTl.to(cover, { clipPath: "inset(0% 0% 0% 0%)", duration: 1.0, ease: "power3.inOut" }, 0.1);
      cTl.to(cover, { scale: 1, duration: 1.2, ease: "power2.out" }, 0.1);
      cTl.to(cover, { filter: "brightness(1) saturate(1) blur(0px)", duration: 0.9, ease: "power2.out" }, 0.2);
    };
    if (cover.complete && cover.naturalWidth) setTimeout(reveal, 80);
    else cover.addEventListener("load", () => setTimeout(reveal, 40), { once: true });
  }

  [date, h1, excerpt, meta].forEach((el) => el?.classList.add("gsap-revealed", "visible"));
}

// ─── Article content scroll reveals (headings, quotes, code, figures, footer, author) ───
let cachedGlow: string | null = null;
function glowFlash(el: Element) {
  if (cachedGlow === null) cachedGlow = getComputedStyle(document.documentElement).getPropertyValue("--glow").trim();
  if (!cachedGlow) return;
  gsap.fromTo(el, { boxShadow: `0 0 16px 2px ${cachedGlow}` }, { boxShadow: "0 0 0px 0px rgba(0,0,0,0)", duration: 0.8, ease: "power2.out" });
}

export function articleScrollReveals(contentEl: HTMLElement) {
  const article = contentEl.closest(".lb-article");

  contentEl.querySelectorAll("h2").forEach((el) => {
    gsap.set(el, { opacity: 0, clipPath: "inset(0 100% 0 0)" });
    ScrollTrigger.create({ trigger: el, start: "top 88%", once: true, onEnter: () => {
      const t = gsap.timeline({ onComplete: () => { el.classList.add("gsap-revealed", "visible"); gsap.set(el, { clearProps: "clipPath" }); glowFlash(el); } });
      t.to(el, { opacity: 1, clipPath: "inset(0 0% 0 0)", duration: 0.7, ease: "power3.out" }, 0);
    } });
  });
  contentEl.querySelectorAll("h3").forEach((el) => {
    gsap.set(el, { opacity: 0, rotationX: -40, transformOrigin: "50% 100%", filter: "blur(3px)", y: 12 });
    ScrollTrigger.create({ trigger: el, start: "top 88%", once: true, onEnter: () => {
      gsap.to(el, { opacity: 1, rotationX: 0, filter: "blur(0px)", y: 0, duration: 0.6, ease: "back.out(1.4)", onComplete: () => el.classList.add("gsap-revealed", "visible") });
    } });
  });
  contentEl.querySelectorAll("blockquote").forEach((el) => {
    gsap.set(el, { opacity: 0, x: -20, clipPath: "inset(0 100% 0 0)" });
    ScrollTrigger.create({ trigger: el, start: "top 88%", once: true, onEnter: () => {
      const t = gsap.timeline({ onComplete: () => { el.classList.add("gsap-revealed", "visible"); gsap.set(el, { clearProps: "clipPath" }); glowFlash(el); } });
      t.to(el, { opacity: 1, x: 0, duration: 0.6, ease: "power3.out" }, 0);
      t.to(el, { clipPath: "inset(0 0% 0 0)", duration: 0.7, ease: "power2.out" }, 0.05);
    } });
  });
  contentEl.querySelectorAll("pre").forEach((el) => {
    gsap.set(el, { opacity: 0, clipPath: "inset(0 0 100% 0)", filter: "blur(2px)" });
    ScrollTrigger.create({ trigger: el, start: "top 88%", once: true, onEnter: () => {
      const t = gsap.timeline({ onComplete: () => { el.classList.add("gsap-revealed", "visible"); gsap.set(el, { clearProps: "clipPath,filter" }); glowFlash(el); } });
      t.to(el, { opacity: 1, duration: 0.3, ease: "power2.out" }, 0);
      t.to(el, { clipPath: "inset(0 0 0% 0)", filter: "blur(0px)", duration: 0.8, ease: "power2.out" }, 0.05);
    } });
  });
  contentEl.querySelectorAll("figure, .lb-gallery").forEach((el) => {
    gsap.set(el, { opacity: 0, clipPath: "inset(5% 5% 5% 5%)", scale: 0.95, filter: "saturate(0) blur(3px)" });
    ScrollTrigger.create({ trigger: el, start: "top 88%", once: true, onEnter: () => {
      const t = gsap.timeline({ onComplete: () => { el.classList.add("gsap-revealed", "visible"); gsap.set(el, { clearProps: "clipPath,filter" }); } });
      t.to(el, { opacity: 1, duration: 0.3, ease: "power2.out" }, 0);
      t.to(el, { clipPath: "inset(0% 0% 0% 0%)", scale: 1, filter: "saturate(1) blur(0px)", duration: 0.9, ease: "power3.out" }, 0.05);
    } });
  });
  contentEl.querySelectorAll("hr").forEach((el) => {
    gsap.set(el, { scaleX: 0, transformOrigin: "center center", rotationZ: 1 });
    ScrollTrigger.create({ trigger: el, start: "top 88%", once: true, onEnter: () => {
      gsap.to(el, { scaleX: 1, rotationZ: 0, duration: 0.8, ease: "power3.inOut", onComplete: () => el.classList.add("gsap-revealed", "visible") });
    } });
  });

  const footer = article?.querySelector(".lb-article-footer") as HTMLElement | null;
  if (footer) {
    const shareIcons = footer.querySelectorAll(".lb-share-icon");
    gsap.set(footer, { opacity: 0, y: 24, clipPath: "inset(100% 0 0 0)" });
    if (shareIcons.length) gsap.set(shareIcons, { opacity: 0, scale: 0.3, rotationZ: -15 });
    ScrollTrigger.create({ trigger: footer, start: "top 88%", once: true, onEnter: () => {
      const t = gsap.timeline({ defaults: { ease: P.ease }, onComplete: () => { footer.classList.add("gsap-revealed", "visible"); gsap.set(footer, { clearProps: "clipPath" }); } });
      t.to(footer, { opacity: 1, y: 0, clipPath: "inset(0% 0 0 0)", duration: 0.6, ease: "power3.out" }, 0);
      if (shareIcons.length) t.to(shareIcons, { opacity: 1, scale: 1, rotationZ: 0, stagger: 0.05, duration: 0.4, ease: "elastic.out(1, 0.35)" }, 0.15);
    } });
  }

  const authorCard = article?.querySelector(".lb-author-card") as HTMLElement | null;
  if (authorCard) {
    const avatar = authorCard.querySelector(".lb-author-avatar");
    const authorName = authorCard.querySelector(".lb-author-name");
    const authorBio = authorCard.querySelector(".lb-author-bio");
    const authorLinks = authorCard.querySelector(".lb-author-links");
    gsap.set(authorCard, { opacity: 0, y: 24, clipPath: "inset(10% 10% 10% 10%)" });
    ScrollTrigger.create({ trigger: authorCard, start: "top 88%", once: true, onEnter: () => {
      const t = gsap.timeline({ defaults: { ease: P.ease }, onComplete: () => { authorCard.classList.add("gsap-revealed", "visible"); gsap.set(authorCard, { clearProps: "clipPath" }); } });
      t.to(authorCard, { opacity: 1, y: 0, clipPath: "inset(0% 0% 0% 0%)", duration: 0.6, ease: "power3.out" }, 0);
      if (avatar) t.from(avatar, { scale: 0.2, rotation: -180, opacity: 0, duration: 0.55, ease: "back.out(2)" }, 0.12);
      if (authorName) t.from(authorName, { x: 20, opacity: 0, filter: "blur(4px)", duration: 0.4, ease: "power3.out" }, 0.22);
      if (authorBio) t.from(authorBio, { y: 12, opacity: 0, filter: "blur(2px)", duration: 0.4, ease: "power2.out" }, 0.32);
      if (authorLinks) t.from(authorLinks, { y: 10, opacity: 0, scale: 0.8, duration: 0.35, ease: "elastic.out(1, 0.4)" }, 0.4);
    } });
  }

  const remaining = article ? Array.from(article.querySelectorAll(".lb-reveal:not(.gsap-revealed)")) : [];
  if (remaining.length) {
    gsap.set(remaining, { opacity: 0, y: 20, filter: "blur(2px)" });
    ScrollTrigger.batch(remaining, {
      start: "top 90%",
      onEnter: (batch) => gsap.to(batch, { opacity: 1, y: 0, filter: "blur(0px)", stagger: 0.06, duration: 0.55, ease: P.ease, onComplete: () => batch.forEach((el) => { el.classList.add("gsap-revealed", "visible"); gsap.set(el, { clearProps: "filter" }); }) }),
      once: true,
    });
  }
}

// ─── Brand text scramble ───
export function scrambleBrand(el: HTMLElement, text: string) {
  if (!el || reduced()) return;
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
  const q = Array.from(text).map((to, i) => ({
    to,
    start: Math.floor(Math.random() * 15),
    end: Math.floor(Math.random() * 15) + 15 + i * 2,
    c: null as string | null,
  }));
  let f = 0;
  (function u() {
    let o = "", done = 0;
    for (const x of q) {
      if (f >= x.end) { o += x.to; done++; }
      else if (f >= x.start) {
        if (!x.c || Math.random() < 0.3) x.c = chars[Math.floor(Math.random() * chars.length)];
        o += `<span style="color:var(--accent);opacity:.5">${x.c}</span>`;
      }
    }
    el.innerHTML = o;
    if (done < q.length) { f++; requestAnimationFrame(u); }
    else { el.textContent = text; }
  })();
}

export function killScrollTriggers() {
  ScrollTrigger.getAll().forEach((t) => t.kill());
  removeGsapActive();
}
