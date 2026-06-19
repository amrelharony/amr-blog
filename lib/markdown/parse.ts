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

const marked = new Marked({ gfm: true, breaks: true, async: false });

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
