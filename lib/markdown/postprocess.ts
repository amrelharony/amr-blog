// HTML post-processing ported verbatim from Js/blog-core.js (postProcessHtml,
// processEmbeds) and Js/blog-article.js (processFootnotes, processGalleries).
// These operate on marked's HTML output as strings, so they run unchanged on the server.
import { esc } from "@/lib/format";

/** Convert [!NOTE|TIP|WARNING|DANGER|IMPORTANT|CAUTION|QUOTE] blockquotes to callouts. */
export function postProcessHtml(html: string): string {
  return html.replace(
    /<blockquote>\s*<p>\[!(NOTE|TIP|WARNING|DANGER|IMPORTANT|CAUTION|QUOTE)\]\s*<br\s*\/?>\s*([\s\S]*?)<\/p>\s*<\/blockquote>/gi,
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

/** Turn bare YouTube / X(Twitter) / CodePen links into embeds. */
export function processEmbeds(html: string): string {
  html = html.replace(
    /<p>\s*(?:<a[^>]*>)?\s*(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})[^\s<]*\s*(?:<\/a>)?\s*<\/p>/gi,
    '<div class="lb-embed"><div class="lb-yt-embed"><iframe src="https://www.youtube-nocookie.com/embed/$1" allowfullscreen loading="lazy" title="YouTube video"></iframe></div></div>',
  );
  html = html.replace(
    /<p>\s*(?:<a[^>]*>)?\s*https?:\/\/(?:twitter\.com|x\.com)\/(\w+)\/status\/(\d+)[^\s<]*\s*(?:<\/a>)?\s*<\/p>/gi,
    '<div class="lb-tweet-embed"><blockquote class="twitter-tweet" data-dnt="true"><a href="https://twitter.com/$1/status/$2"></a></blockquote></div>',
  );
  html = html.replace(
    /<p>\s*(?:<a[^>]*>)?\s*https?:\/\/codepen\.io\/([\w-]+)\/pen\/([\w-]+)[^\s<]*\s*(?:<\/a>)?\s*<\/p>/gi,
    '<div class="lb-codepen-embed"><iframe src="https://codepen.io/$1/embed/$2?default-tab=result&theme-id=dark" loading="lazy" title="CodePen"></iframe></div>',
  );
  return html;
}

/** Extract [^id] footnote refs/definitions and append a footnotes section. */
export function processFootnotes(html: string): string {
  const refs: Record<string, string> = {};
  const refRegex = /\[\^(\w+)\]/g;
  const defRegex = /<p>\[\^(\w+)\]:\s*([\s\S]*?)<\/p>/g;

  html = html.replace(defRegex, (_m, id: string, text: string) => {
    refs[id] = text.trim();
    return "";
  });

  html = html.replace(refRegex, (_m, id: string) => {
    if (!refs[id]) return `[^${id}]`;
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

/** Wrap images in figures/captions and group consecutive figures into galleries. */
export function processGalleries(html: string): string {
  html = html.replace(/<img(?![^>]*loading=)/g, '<img loading="lazy" decoding="async"');

  html = html.replace(/<p>\s*(<img[^>]+>)\s*<\/p>/g, (_m, imgTag: string) => {
    const alt = (imgTag.match(/alt="([^"]*)"/) || [])[1] || "";
    if (alt) {
      return `<figure>${imgTag}<figcaption>${esc(alt)}</figcaption></figure>`;
    }
    return `<figure>${imgTag}</figure>`;
  });

  html = html.replace(/(<figure>[\s\S]*?<\/figure>\s*){2,}/g, (match) => {
    return (
      '<div class="lb-gallery">' +
      match.replace(/<\/?figure>/g, "").replace(/<figcaption>[\s\S]*?<\/figcaption>/g, "") +
      "</div>"
    );
  });
  return html;
}
