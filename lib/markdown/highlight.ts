// Server-side syntax highlighting for fenced code blocks. Runs at render/ISR
// time on agent-supplied content, so it is deliberately constrained:
//   * fixed language set (core build — only registered grammars ship or run)
//   * input size cap — hljs grammars are regex-based, so the cap bounds their
//     worst-case backtracking the same way the bounded quantifiers do in
//     lib/markdown/postprocess.ts (see the ReDoS budget in highlight.test.ts)
//   * any failure falls back to the plain escaped <code> the blog shipped before
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import kotlin from "highlight.js/lib/languages/kotlin";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import swift from "highlight.js/lib/languages/swift";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

hljs.registerLanguage("bash", bash); // aliases: sh, zsh
hljs.registerLanguage("csharp", csharp); // aliases: cs, c#
hljs.registerLanguage("css", css);
hljs.registerLanguage("go", go); // alias: golang
hljs.registerLanguage("java", java);
hljs.registerLanguage("javascript", javascript); // aliases: js, jsx, mjs, cjs
hljs.registerLanguage("json", json);
hljs.registerLanguage("kotlin", kotlin); // alias: kt
hljs.registerLanguage("python", python); // aliases: py, gyp
hljs.registerLanguage("rust", rust); // alias: rs
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("swift", swift);
hljs.registerLanguage("typescript", typescript); // aliases: ts, tsx, mts, cts
hljs.registerLanguage("xml", xml); // aliases: html, xhtml, svg, ...
hljs.registerLanguage("yaml", yaml); // aliases: yml

/** Blocks beyond this render as plain escaped text — bounds hljs regex cost. */
export const MAX_HIGHLIGHT_CHARS = 30_000;

/** Minimal HTML escape for the plain-code fallback (matches marked's escaping). */
export function escapeCode(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Language id from a fence info string ("ts", "js title=x", "TypeScript"),
 * resolved against the registered grammar set (aliases included), or null.
 */
export function normalizeLang(lang: string | null | undefined): string | null {
  const first = (lang || "").trim().split(/\s+/, 1)[0].toLowerCase();
  if (!first) return null;
  return hljs.getLanguage(first) ? first : null;
}

/**
 * Highlighted (or plainly escaped) inner HTML for a code block, plus the
 * resolved language for the badge. Never throws.
 */
export function highlightCode(
  text: string,
  lang: string | null | undefined,
): { html: string; lang: string | null } {
  const language = normalizeLang(lang);
  if (!language || text.length > MAX_HIGHLIGHT_CHARS) {
    return { html: escapeCode(text), lang: language };
  }
  try {
    return { html: hljs.highlight(text, { language }).value, lang: language };
  } catch {
    return { html: escapeCode(text), lang: language };
  }
}
