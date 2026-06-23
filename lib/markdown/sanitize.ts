// Server-side HTML sanitizer for the rendered markdown body.
//
// Uses `sanitize-html` (htmlparser2-based, NO DOM) rather than DOMPurify+jsdom:
// jsdom pulls an ESM-only transitive dep (@exodus/bytes via html-encoding-sniffer)
// that Turbopack's serverless build can't load (ERR_REQUIRE_ESM), 500-ing the
// on-demand /p/[slug] render on Vercel; and DOMPurify with a pure-JS DOM (linkedom/
// happy-dom) silently no-ops or mis-sanitizes. sanitize-html is allowlist-based and
// pure-JS, so it's serverless-safe and the security boundary is explicit.
//
// Allowlist mirrors exactly what the render pipeline (marked GFM + lib/markdown/
// postprocess.ts) emits: standard markdown + GFM tables, callout/embed/footnote
// <div>/<span> wrappers, and embed <iframe>s — restricted to the YouTube/CodePen
// hosts. Everything else (notably <img>/<figure>/<svg>/<math>/<style> and the inline
// `style` attribute) is discarded — the blog is text-only and those are CSS-injection
// / mXSS vectors. See lib/markdown/sanitize.test.ts.
import sanitizeHtmlLib from "sanitize-html";

export function sanitizeHtml(html: string): string {
  return sanitizeHtmlLib(html, {
    allowedTags: [
      "p", "br", "hr",
      "h1", "h2", "h3", "h4", "h5", "h6",
      "strong", "em", "del", "b", "i", "code", "pre", "a", "sup", "sub",
      "ul", "ol", "li", "blockquote",
      "table", "thead", "tbody", "tr", "th", "td",
      "div", "span", "iframe",
    ],
    allowedAttributes: {
      "*": ["class"],
      a: ["href", "class", "id", "data-fn", "data-fn-text"],
      div: ["class", "id"],
      span: ["class"],
      blockquote: ["class", "data-dnt"],
      th: ["align"],
      td: ["align"],
      iframe: ["src", "allow", "allowfullscreen", "frameborder", "scrolling", "loading", "title"],
    },
    // <iframe> survives ONLY for the fixed-origin embeds processEmbeds emits. Without
    // this, an iframe authored in the body would frame an arbitrary origin.
    allowedIframeHostnames: ["www.youtube-nocookie.com", "youtube-nocookie.com", "codepen.io"],
    allowIframeRelativeUrls: false,
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    // allowedIframeHostnames only strips a bad-host iframe's `src`, leaving an empty
    // <iframe>. Drop any iframe left without a src so a non-embed iframe is removed
    // entirely (not left as an empty frame).
    exclusiveFilter: (frame) => frame.tag === "iframe" && !frame.attribs.src,
  });
}
