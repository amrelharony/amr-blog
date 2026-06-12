// Server-side syntax highlighting for fenced code blocks via shiki.
// One highlighter per process: createHighlighter() is async but codeToHtml()
// is synchronous afterwards, so the marked pipeline can stay sync.
import { createHighlighter, type Highlighter } from "shiki";
import { esc } from "@/lib/format";

const DARK_THEME = "github-dark";
const LIGHT_THEME = "github-light";

const LANGS = [
  "ts",
  "tsx",
  "js",
  "jsx",
  "json",
  "bash",
  "shell",
  "python",
  "sql",
  "yaml",
  "html",
  "css",
  "diff",
  "markdown",
];

const LANG_ALIASES: Record<string, string> = {
  sh: "bash",
  zsh: "bash",
  javascript: "js",
  typescript: "ts",
  node: "js",
  py: "python",
  yml: "yaml",
  shellscript: "shell",
};

let highlighterPromise: Promise<Highlighter> | null = null;

export function getHighlighter(): Promise<Highlighter> {
  highlighterPromise ??= createHighlighter({
    themes: [DARK_THEME, LIGHT_THEME],
    langs: [...LANGS],
  });
  return highlighterPromise;
}

/**
 * Fenced code block → highlighted <pre class="shiki">…</pre> with a language
 * label and copy button injected (styled by .lb-code-lang / .lb-copy-btn in
 * blog.css). Falls back to an escaped plain block for unknown languages.
 */
export function highlightCodeBlock(hl: Highlighter, code: string, infoString?: string): string {
  const requested = (infoString || "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  const lang = LANG_ALIASES[requested] || requested;
  let html: string;
  try {
    if (!lang || !hl.getLoadedLanguages().includes(lang)) throw new Error("unloaded lang");
    html = hl.codeToHtml(code, {
      lang,
      themes: { dark: DARK_THEME, light: LIGHT_THEME },
      defaultColor: false,
    });
  } catch {
    html = `<pre class="shiki"><code>${esc(code)}</code></pre>`;
  }
  const chrome =
    `<span class="lb-code-lang">${esc(requested || "text")}</span>` +
    `<button class="lb-copy-btn" type="button" aria-label="Copy code">COPY</button>`;
  return html.replace(/^(<pre[^>]*>)/, `$1${chrome}`);
}
