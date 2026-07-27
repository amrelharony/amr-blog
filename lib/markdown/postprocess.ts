// HTML post-processing ported verbatim from Js/blog-core.js (postProcessHtml,
// processEmbeds) and Js/blog-article.js (processFootnotes, processGalleries).
// These operate on marked's HTML output as strings, so they run unchanged on the server.
import { esc } from "@/lib/format";

/** Convert [!NOTE|TIP|WARNING|DANGER|IMPORTANT|CAUTION|QUOTE] blockquotes to callouts. */
export function postProcessHtml(html: string): string {
  return html.replace(
    // Bounded quantifiers (\s{0,8}, body {0,20000}): an unbounded \s* gap before the
    // lazy body backtracks quadratically on a <blockquote>+long-whitespace body with
    // no close — same server-side/build ReDoS class as the embed regexes below.
    /<blockquote>\s{0,8}<p>\[!(NOTE|TIP|WARNING|DANGER|IMPORTANT|CAUTION|QUOTE)\]\s{0,8}<br\s{0,8}\/?>\s{0,8}([\s\S]{0,20000}?)<\/p>\s{0,8}<\/blockquote>/gi,
    (_m, type: string, content: string) => {
      const t = type.toUpperCase();
      const icons: Record<string, string> = {
        NOTE: "ℹ️",
        TIP: "💡",
        WARNING: "⚠️",
        DANGER: "🛑",
        IMPORTANT: "❗",
        CAUTION: "🚨",
        QUOTE: "❝",
      };
      const cls: Record<string, string> = {
        NOTE: "note",
        TIP: "tip",
        WARNING: "warning",
        DANGER: "danger",
        IMPORTANT: "warning",
        CAUTION: "danger",
        QUOTE: "quote",
      };
      return `<div class="callout callout-${cls[t] || "note"}"><div class="callout-title">${icons[t] || ""} ${t}</div><p>${content}</p></div>`;
    },
  );
}

/** Turn bare YouTube / X(Twitter) / CodePen links into embeds.
 *  EVERY quantifier is BOUNDED on purpose — these run server-side (article page +
 *  build) over agent-controlled content, so an unbounded quantifier is a
 *  quadratic-ReDoS DoS. The load-bearing fix is the two `\s*` straddling the
 *  empty-able optional (`\s*(?:<a…>)?\s*`): a long whitespace run could partition
 *  between them O(n) ways → O(n²) (a `<p>`+300k-spaces body hung the render for
 *  minutes). Bounding the `\s` (and the rest) removes the ambiguity; the limits
 *  stay generous for real share URLs. */
export function processEmbeds(html: string): string {
  html = html.replace(
    /<p>\s{0,8}(?:<a[^>]{0,200}>)?\s{0,8}(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})[^\s<]{0,256}\s{0,8}(?:<\/a>)?\s{0,8}<\/p>/gi,
    '<div class="lb-embed"><div class="lb-yt-embed"><iframe src="https://www.youtube-nocookie.com/embed/$1" allowfullscreen loading="lazy" title="YouTube video"></iframe></div></div>',
  );
  html = html.replace(
    /<p>\s{0,8}(?:<a[^>]{0,200}>)?\s{0,8}https?:\/\/(?:twitter\.com|x\.com)\/(\w{1,40})\/status\/(\d{1,25})[^\s<]{0,256}\s{0,8}(?:<\/a>)?\s{0,8}<\/p>/gi,
    '<div class="lb-tweet-embed"><blockquote class="twitter-tweet" data-dnt="true"><a href="https://twitter.com/$1/status/$2"></a></blockquote></div>',
  );
  html = html.replace(
    /<p>\s{0,8}(?:<a[^>]{0,200}>)?\s{0,8}https?:\/\/codepen\.io\/([\w-]{1,80})\/pen\/([\w-]{1,80})[^\s<]{0,256}\s{0,8}(?:<\/a>)?\s{0,8}<\/p>/gi,
    '<div class="lb-codepen-embed"><iframe src="https://codepen.io/$1/embed/$2?default-tab=result&theme-id=dark" loading="lazy" title="CodePen"></iframe></div>',
  );
  return html;
}

/** Extract [^id] footnote refs/definitions and append a footnotes section. */
export function processFootnotes(html: string): string {
  // Null-prototype: ids come from \w+ in agent content, so a ref like [^toString]
  // would otherwise resolve through Object.prototype — `id in refs` reported true
  // for an UNdefined footnote and esc() threw on the inherited function, 500-ing the
  // article page and every feed that renders it.
  const refs: Record<string, string> = Object.create(null);
  const refRegex = /\[\^(\w+)\]/g;
  // Bounded (\s{0,8}, body {0,8000}): the unbounded \s* + lazy body backtracked
  // quadratically on a `<p>[^x]:` + long-whitespace body with no close (ReDoS).
  const defRegex = /<p>\[\^(\w+)\]:\s{0,8}([\s\S]{0,8000}?)<\/p>/g;

  html = html.replace(defRegex, (_m, id: string, text: string) => {
    refs[id] = text.trim();
    return "";
  });

  html = html.replace(refRegex, (_m, id: string) => {
    if (!Object.hasOwn(refs, id)) return `[^${id}]`;
    return `<sup><a href="#fn-${id}" class="lb-fn-ref" data-fn="${esc(id)}" data-fn-text="${esc(refs[id])}">${id}</a></sup>`;
  });

  if (Object.keys(refs).length) {
    html += '<div class="lb-footnotes"><div class="lb-footnotes-title">Footnotes</div>';
    Object.keys(refs).forEach((id) => {
      html += `<div class="lb-footnote-item" id="fn-${id}"><span class="lb-footnote-num">${id}.</span><span>${esc(refs[id])} <a class="lb-footnote-back" href="#fnref-${id}">↩</a></span></div>`;
    });
    html += "</div>";
  }
  return html;
}
