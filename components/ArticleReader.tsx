"use client";
import { useEffect } from "react";
import { esc } from "@/lib/format";
import { assignHeadingIds } from "@/lib/toc";

// Reading-experience layer ported from Js/blog-article.js:
// reading progress bar, table of contents (+ scrollspy), footnote hover tooltips,
// and image lightbox — all operating on the server-rendered article DOM.
// `slug` keys the effect: the App Router reuses this instance across /p/[slug]
// navigations, so a bare [] dep would leave the TOC, lightbox, and footnote
// tooltips wired to the *previous* article. Re-running rebuilds them (cleanups
// below fully tear down the prior article's nodes + listeners first).
export default function ArticleReader({ slug }: { slug: string }) {
  useEffect(() => {
    const cleanups: Array<() => void> = [];

    // ── Reading progress bar ──
    const bar = document.createElement("div");
    bar.className = "lb-progress-bar";
    const fill = document.createElement("div");
    fill.className = "lb-progress-fill";
    bar.appendChild(fill);
    document.body.appendChild(bar);
    // rAF-throttled so the per-scroll layout read (scrollHeight/clientHeight)
    // doesn't thrash on every scroll event (matches ArticleToolbar's pattern).
    let rafPending = false;
    const paint = () => {
      rafPending = false;
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      fill.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + "%";
      // .lb-progress-bar is opacity:0 until `.visible` (blog.css). Show it once
      // the page is actually scrollable.
      bar.classList.toggle("visible", max > 40);
    };
    const onScroll = () => {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(paint);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    paint();
    cleanups.push(() => {
      window.removeEventListener("scroll", onScroll);
      bar.remove();
    });

    const article = document.querySelector(".lb-article");
    const content = document.querySelector(".lb-content") as HTMLElement | null;

    // ── Table of contents + scrollspy ──
    // Note: GSAP (articleScrollReveals) only animates heading opacity/transform,
    // never their text, so reading textContent here is order-independent.
    if (article && content) {
      const headings = Array.from(content.querySelectorAll("h2, h3")) as HTMLElement[];
      if (headings.length >= 2) {
        const items = assignHeadingIds(
          headings.map((h) => ({ tag: h.tagName, text: h.textContent || "", existingId: h.id })),
        );
        items.forEach((it, i) => {
          headings[i].id = it.id;
        });

        const nav = document.createElement("nav");
        nav.className = "lb-toc";
        nav.setAttribute("aria-label", "Table of contents");
        nav.innerHTML =
          `<button class="lb-toc-toggle" aria-expanded="true">Contents (${items.length})</button>` +
          '<ol class="lb-toc-list">' +
          items
            .map(
              (it) =>
                `<li class="lb-toc-item"><a class="lb-toc-link depth-${it.depth}" href="#${it.id}" data-toc-id="${it.id}">${esc(it.text)}</a></li>`,
            )
            .join("") +
          "</ol>";
        content.insertAdjacentElement("beforebegin", nav);

        const toggle = nav.querySelector(".lb-toc-toggle")!;
        toggle.addEventListener("click", () => {
          nav.classList.toggle("collapsed");
          toggle.setAttribute("aria-expanded", String(!nav.classList.contains("collapsed")));
        });

        const tocLinks = Array.from(nav.querySelectorAll<HTMLAnchorElement>(".lb-toc-link"));
        tocLinks.forEach((link) => {
          link.addEventListener("click", (e) => {
            e.preventDefault();
            const id = link.dataset.tocId!;
            const target = document.getElementById(id);
            if (target) {
              target.scrollIntoView({ behavior: "smooth", block: "start" });
              history.replaceState(null, "", "#" + id);
            }
          });
        });

        const spy = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                tocLinks.forEach((l) => {
                  l.classList.remove("active");
                  l.removeAttribute("aria-current");
                });
                const link = nav.querySelector(`[data-toc-id="${entry.target.id}"]`);
                if (link) {
                  link.classList.add("active");
                  link.setAttribute("aria-current", "location");
                }
              }
            });
          },
          { rootMargin: "-10% 0px -80% 0px" },
        );
        headings.forEach((h) => spy.observe(h));
        cleanups.push(() => {
          spy.disconnect();
          nav.remove();
        });
      }
    }

    // ── Footnote hover tooltips ──
    const fnHandlers: Array<{ el: HTMLElement; enter: () => void; leave: () => void }> = [];
    document.querySelectorAll<HTMLElement>(".lb-fn-ref").forEach((ref) => {
      ref.id = "fnref-" + ref.dataset.fn;
      const enter = () => {
        document.querySelector(".lb-footnote-tooltip")?.remove();
        const tip = document.createElement("div");
        tip.className = "lb-footnote-tooltip";
        tip.textContent = ref.dataset.fnText || "";
        document.body.appendChild(tip);
        const rect = ref.getBoundingClientRect();
        tip.style.left = Math.min(rect.left, window.innerWidth - 340) + "px";
        tip.style.top = rect.bottom + window.scrollY + 6 + "px";
      };
      const leave = () => document.querySelector(".lb-footnote-tooltip")?.remove();
      ref.addEventListener("mouseenter", enter);
      ref.addEventListener("mouseleave", leave);
      fnHandlers.push({ el: ref, enter, leave });
    });
    cleanups.push(() => {
      fnHandlers.forEach(({ el, enter, leave }) => {
        el.removeEventListener("mouseenter", enter);
        el.removeEventListener("mouseleave", leave);
      });
      document.querySelector(".lb-footnote-tooltip")?.remove();
    });

    // ── Image lightbox (cover + any inline body images) ──
    const cover = document.querySelector(".lb-cover-img") as HTMLImageElement | null;
    const imgs: HTMLImageElement[] = [
      ...(cover ? [cover] : []),
      ...(content ? (Array.from(content.querySelectorAll("img")) as HTMLImageElement[]) : []),
    ];
    let box: HTMLElement | null = null;
    let idx = 0;
    const update = () => {
      if (!box) return;
      const im = imgs[idx];
      (box.querySelector(".lb-lightbox-img") as HTMLImageElement).src = im.src;
      (box.querySelector(".lb-lightbox-img") as HTMLImageElement).alt = im.alt || "";
      const cap = box.querySelector(".lb-lightbox-caption") as HTMLElement;
      cap.textContent = im.alt || "";
      cap.style.display = im.alt ? "" : "none";
      const counter = box.querySelector(".lb-lightbox-counter");
      if (counter) counter.textContent = `${idx + 1} / ${imgs.length}`;
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft" && imgs.length > 1) { idx = (idx - 1 + imgs.length) % imgs.length; update(); }
      else if (e.key === "ArrowRight" && imgs.length > 1) { idx = (idx + 1) % imgs.length; update(); }
    };
    const close = () => {
      document.removeEventListener("keydown", keyHandler);
      if (box) {
        box.classList.remove("show");
        const el = box;
        setTimeout(() => el.remove(), 250);
        box = null;
      }
    };
    const open = (i: number) => {
      idx = i;
      box?.remove();
      box = document.createElement("div");
      box.className = "lb-lightbox";
      box.innerHTML =
        '<button class="lb-lightbox-close" title="Close">&times;</button>' +
        (imgs.length > 1 ? `<span class="lb-lightbox-counter">${i + 1} / ${imgs.length}</span>` : "") +
        '<img class="lb-lightbox-img" src="" alt="">' +
        '<div class="lb-lightbox-caption"></div>' +
        (imgs.length > 1
          ? '<button class="lb-lightbox-nav lb-lightbox-prev" aria-label="Previous image">&#8249;</button><button class="lb-lightbox-nav lb-lightbox-next" aria-label="Next image">&#8250;</button>'
          : "");
      document.body.appendChild(box);
      update();
      requestAnimationFrame(() => box?.classList.add("show"));
      box.querySelector(".lb-lightbox-close")!.addEventListener("click", close);
      box.addEventListener("click", (e) => { if (e.target === box) close(); });
      box.querySelector(".lb-lightbox-prev")?.addEventListener("click", (e) => { e.stopPropagation(); idx = (idx - 1 + imgs.length) % imgs.length; update(); });
      box.querySelector(".lb-lightbox-next")?.addEventListener("click", (e) => { e.stopPropagation(); idx = (idx + 1) % imgs.length; update(); });
      document.addEventListener("keydown", keyHandler);
    };
    const imgHandlers: Array<{ img: HTMLImageElement; h: (e: MouseEvent) => void }> = [];
    imgs.forEach((img, i) => {
      const h = (e: MouseEvent) => { e.stopPropagation(); open(i); };
      img.addEventListener("click", h);
      imgHandlers.push({ img, h });
    });
    cleanups.push(() => {
      imgHandlers.forEach(({ img, h }) => img.removeEventListener("click", h));
      document.removeEventListener("keydown", keyHandler);
      document.querySelector(".lb-lightbox")?.remove();
    });

    // ── Twitter/X embeds ── processEmbeds emits <blockquote class="twitter-tweet">, but
    // widgets.js isn't loaded globally — hydrate it here when a tweet is present.
    if (content && content.querySelector(".twitter-tweet")) {
      const tw = window as Window & { twttr?: { widgets?: { load?: (el?: Element) => void } } };
      if (tw.twttr?.widgets?.load) tw.twttr.widgets.load(content);
      else if (!document.getElementById("twitter-wjs")) {
        const s = document.createElement("script");
        s.id = "twitter-wjs";
        s.src = "https://platform.twitter.com/widgets.js";
        s.async = true;
        document.body.appendChild(s);
      }
    }

    return () => cleanups.forEach((fn) => fn());
  }, [slug]);

  return null;
}
