// Markdown → sanitized HTML, reproducing the exact pipeline of the current blog:
//   Js/blog-article.js:1107  processFootnotes(processGalleries(B.parseMarkdown(content)))
//   Js/blog-core.js:98       parseMarkdown = processEmbeds(postProcessHtml(marked.parse(md)))
// then DOMPurify sanitize. Uses marked v18 (synchronous, async disabled).
// Fenced code blocks are highlighted server-side with shiki; the highlighter
// is awaited once before the (still synchronous) parse runs.
import { Marked } from "marked";
import { getHighlighter, highlightCodeBlock } from "@/lib/markdown/highlight";
import {
  postProcessHtml,
  processEmbeds,
  processFootnotes,
  processGalleries,
} from "@/lib/markdown/postprocess";
import { sanitizeHtml } from "@/lib/markdown/sanitize";
import type { Highlighter } from "shiki";

let hl: Highlighter | null = null;

const marked = new Marked({
  gfm: true,
  breaks: true,
  async: false,
  renderer: {
    code({ text, lang }) {
      // false → fall through to marked's default renderer (pre-highlighter).
      return hl ? highlightCodeBlock(hl, text, lang) : false;
    },
  },
});

/** Raw markdown → HTML (pre-sanitize), matching B.parseMarkdown ordering. */
function parseMarkdown(md: string | null | undefined): string {
  const raw = marked.parse(md ?? "") as string;
  return processEmbeds(postProcessHtml(raw));
}

/** Full article body pipeline → sanitized, embed-ready HTML string. */
export async function renderArticleHtml(md: string | null | undefined): Promise<string> {
  hl = await getHighlighter();
  const html = processFootnotes(processGalleries(parseMarkdown(md)));
  return sanitizeHtml(html);
}
