import { describe, it, expect } from "vitest";
import {
  highlightCode,
  normalizeLang,
  escapeCode,
  MAX_HIGHLIGHT_CHARS,
} from "@/lib/markdown/highlight";

describe("normalizeLang", () => {
  it("resolves registered languages and their aliases", () => {
    expect(normalizeLang("typescript")).toBe("typescript");
    expect(normalizeLang("ts")).toBe("ts");
    expect(normalizeLang("js")).toBe("js");
    expect(normalizeLang("sh")).toBe("sh");
    expect(normalizeLang("html")).toBe("html");
  });

  it("takes only the first word of the fence info string, case-insensitive", () => {
    expect(normalizeLang("TS title=example.ts")).toBe("ts");
    expect(normalizeLang("  Python  ")).toBe("python");
  });

  it("returns null for unknown or empty languages", () => {
    expect(normalizeLang("brainfuck")).toBeNull();
    expect(normalizeLang("")).toBeNull();
    expect(normalizeLang(undefined)).toBeNull();
    expect(normalizeLang(null)).toBeNull();
  });
});

describe("highlightCode", () => {
  it("emits hljs token spans for a known language", () => {
    const { html, lang } = highlightCode('const x: string = "hi";', "ts");
    expect(lang).toBe("ts");
    expect(html).toContain("hljs-keyword");
    expect(html).toContain("hljs-string");
  });

  it("escapes HTML inside highlighted code (no tag injection)", () => {
    const { html } = highlightCode('const s = "<script>alert(1)</script>";', "js");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("falls back to plain escaped text for unknown languages", () => {
    const { html, lang } = highlightCode("<b>raw</b> & stuff", "not-a-lang");
    expect(lang).toBeNull();
    expect(html).toBe("&lt;b&gt;raw&lt;/b&gt; &amp; stuff");
  });

  it("falls back to plain escaped text past the size cap", () => {
    const big = "x = 1\n".repeat(MAX_HIGHLIGHT_CHARS / 6 + 10);
    const { html } = highlightCode(big, "python");
    expect(html).not.toContain("hljs-");
    expect(html.length).toBeGreaterThan(0);
  });
});

describe("escapeCode", () => {
  it("escapes &, <, >, quotes", () => {
    expect(escapeCode('a < b && c > "d"')).toBe("a &lt; b &amp;&amp; c &gt; &quot;d&quot;");
  });
});

describe("ReDoS guard (hljs grammars run server-side on agent content at render + build)", () => {
  // Same shape as lib/markdown/postprocess.test.ts: bounded input (the
  // MAX_HIGHLIGHT_CHARS cap) must keep worst-case-ish inputs well under budget.
  const BUDGET_MS = 3000;
  const timed = (fn: () => void) => {
    const t = performance.now();
    fn();
    return performance.now() - t;
  };

  it("stays under budget on pathological quote/backslash runs at the size cap", () => {
    const evil = ('"\\' + "'`${".repeat(8)).repeat(MAX_HIGHLIGHT_CHARS / 20).slice(0, MAX_HIGHLIGHT_CHARS);
    for (const lang of ["js", "python", "sql", "bash"]) {
      expect(timed(() => highlightCode(evil, lang))).toBeLessThan(BUDGET_MS);
    }
  });

  it("stays under budget on an unclosed template-literal + brace run", () => {
    const evil = "`${".repeat(MAX_HIGHLIGHT_CHARS / 3);
    expect(timed(() => highlightCode(evil, "ts"))).toBeLessThan(BUDGET_MS);
  });
});
