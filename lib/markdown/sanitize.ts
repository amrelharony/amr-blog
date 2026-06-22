// Server-side HTML sanitizer. Mirrors the DOMPurify config in
// Js/blog-article.js:1110 — allow <iframe> + embed attributes so YouTube /
// CodePen embeds survive. isomorphic-dompurify runs on the server via jsdom.
import DOMPurify from "isomorphic-dompurify";

// <iframe> is allowed only because processEmbeds (lib/markdown/postprocess.ts) emits
// fixed-origin YouTube/CodePen embeds. Without a src allow-list, an iframe authored
// directly in the body would survive sanitization and frame an ARBITRARY origin. This
// hook drops any iframe whose host isn't an intended embed host. Registered once at
// module load; the hook is idempotent so accidental re-registration (dev HMR) is safe.
const ALLOWED_IFRAME_HOSTS = new Set([
  "www.youtube-nocookie.com",
  "youtube-nocookie.com",
  "codepen.io",
]);
DOMPurify.addHook("uponSanitizeElement", (node, data) => {
  if (data.tagName !== "iframe") return;
  const el = node as unknown as Element;
  let host = "";
  try {
    host = new URL(el.getAttribute("src") || "").host.toLowerCase();
  } catch {
    /* unparseable/relative src → not allow-listed */
  }
  if (!ALLOWED_IFRAME_HOSTS.has(host)) el.parentNode?.removeChild(el);
});

export function sanitizeHtml(html: string): string {
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
    // Text-only blog: strip images + their figure wrappers. Also strip <style>,
    // <svg>, and <math> — the blog never uses them in content, and they're CSS-
    // injection / mXSS-wrapper vectors (e.g. an SVG-namespaced <style>@import).
    FORBID_TAGS: ["img", "figure", "figcaption", "style", "svg", "math"],
    // Drop the inline `style` attribute. jsdom has no CSS parser, so DOMPurify
    // passes style strings through verbatim — a `position:fixed;inset:0` overlay
    // would otherwise survive and enable a full-viewport clickjacking/phishing
    // layer. The blog styles content with its own CSS classes, never inline styles.
    FORBID_ATTR: ["style"],
  });
}
