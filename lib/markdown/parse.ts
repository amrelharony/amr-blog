// Markdown → sanitized HTML, reproducing the exact pipeline of the current blog:
//   Js/blog-article.js:1107  processFootnotes(processGalleries(B.parseMarkdown(content)))
//   Js/blog-core.js:98       parseMarkdown = processEmbeds(postProcessHtml(marked.parse(md)))
// then DOMPurify sanitize. Uses marked v18 (synchronous, async disabled).
import { Marked } from "marked";
import {
  postProcessHtml,
  processEmbeds,
  processFootnotes,
} from "@/lib/markdown/postprocess";
import { sanitizeHtml } from "@/lib/markdown/sanitize";
import { highlightCode, escapeCode } from "@/lib/markdown/highlight";

const marked = new Marked({ gfm: true, breaks: true, async: false });

// Fenced code blocks get server-side syntax highlighting (size-capped,
// fixed language set — lib/markdown/highlight.ts). The sanitizer keeps the
// emitted span classes + pre[data-lang] (badge hook) — see sanitize.ts.
marked.use({
  renderer: {
    code({ text, lang, escaped }) {
      // `escaped` means marked already HTML-escaped `text` (rare for fences);
      // highlighting needs the raw source, so emit such blocks untouched.
      if (escaped) return `<pre><code>${text}</code></pre>\n`;
      const { html, lang: language } = highlightCode(text, lang);
      if (!language) return `<pre><code>${html || escapeCode(text)}</code></pre>\n`;
      return `<pre data-lang="${language}"><code class="hljs language-${language}">${html}</code></pre>\n`;
    },
  },
});

/** Raw markdown → HTML (pre-sanitize), matching B.parseMarkdown ordering. */
function parseMarkdown(md: string | null | undefined): string {
  const raw = marked.parse(md ?? "") as string;
  return processEmbeds(postProcessHtml(raw));
}

/** Full article body pipeline → sanitized, embed-ready HTML string. Images are
 *  stripped by the sanitizer (text-only blog), so no gallery step is needed. */
export function renderArticleHtml(md: string | null | undefined): string {
  const html = processFootnotes(parseMarkdown(md));
  return sanitizeHtml(html);
}
