// Server-side HTML sanitizer. Mirrors the DOMPurify config in
// Js/blog-article.js:1110 — allow <iframe> + embed attributes so YouTube /
// CodePen embeds survive. isomorphic-dompurify runs on the server via jsdom.
import DOMPurify from "isomorphic-dompurify";

// The pipeline only ever generates iframes for these hosts (see lib/markdown/postprocess.ts:
// youtube-nocookie embeds + codepen embeds). Re-enabling <iframe> globally would otherwise let
// a stray/compromised draft embed an arbitrary external frame (phishing / clickjacking).
const IFRAME_HOSTS = new Set(["www.youtube-nocookie.com", "youtube-nocookie.com", "codepen.io"]);

let hooked = false;
function ensureHook() {
  if (hooked) return;
  hooked = true;
  DOMPurify.addHook("uponSanitizeElement", (node, data) => {
    if (data.tagName !== "iframe") return;
    const el = node as unknown as Element;
    let host = "";
    try {
      host = new URL(el.getAttribute?.("src") || "").host;
    } catch {
      host = "";
    }
    if (!IFRAME_HOSTS.has(host)) el.parentNode?.removeChild(el);
  });
}

export function sanitizeHtml(html: string): string {
  ensureHook();
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ["iframe"],
    ADD_ATTR: [
      "allow",
      "allowfullscreen",
      "frameborder",
      "scrolling",
      "loading",
      "decoding",
    ],
  });
}
