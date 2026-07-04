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
        const list = nav.querySelector<HTMLElement>(".lb-toc-list")!;
        toggle.addEventListener("click", () => {
          const collapsed = nav.classList.toggle("collapsed");
          toggle.setAttribute("aria-expanded", String(!collapsed));
          // A visually-collapsed list must also leave the tab order / a11y tree.
          list.toggleAttribute("inert", collapsed);
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
              // Move keyboard/screen-reader focus along with the scroll.
              target.tabIndex = -1;
              target.focus({ preventScroll: true });
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

    // ── Copy-code buttons on fenced code blocks ──
    // The blocks arrive server-rendered (dangerouslySetInnerHTML), so the
    // button is injected here like the TOC/progress chrome above.
    if (content) {
      content.querySelectorAll("pre").forEach((pre) => {
        if (pre.querySelector(".lb-code-copy")) return;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "lb-code-copy";
        btn.title = "Copy code";
        btn.setAttribute("aria-label", "Copy code");
        btn.innerHTML = '<i class="fa-regular fa-copy" aria-hidden="true"></i>';
        let timer: number | undefined;
        const onClick = async () => {
          const code = pre.querySelector("code")?.textContent || "";
          try {
            await navigator.clipboard.writeText(code);
          } catch {
            return; // clipboard unavailable — leave the button untouched
          }
          btn.classList.add("copied");
          btn.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i>';
          window.clearTimeout(timer);
          timer = window.setTimeout(() => {
            btn.classList.remove("copied");
            btn.innerHTML = '<i class="fa-regular fa-copy" aria-hidden="true"></i>';
          }, 2000);
        };
        btn.addEventListener("click", onClick);
        pre.appendChild(btn);
        cleanups.push(() => {
          window.clearTimeout(timer);
          btn.removeEventListener("click", onClick);
          btn.remove();
        });
      });
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
