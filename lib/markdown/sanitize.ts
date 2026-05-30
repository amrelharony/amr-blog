// Server-side HTML sanitizer. Mirrors the DOMPurify config in
// Js/blog-article.js:1110 — allow <iframe> + embed attributes so YouTube /
// CodePen embeds survive. isomorphic-dompurify runs on the server via jsdom.
import DOMPurify from "isomorphic-dompurify";

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
  });
}
