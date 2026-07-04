import { describe, it, expect } from "vitest";
import { sanitizeHtml } from "@/lib/markdown/sanitize";

describe("sanitizeHtml (text-only blog)", () => {
  it("strips <img> tags from content", () => {
    const out = sanitizeHtml('<p>Before</p><img src="https://x/a.png" alt="A"><p>After</p>');
    expect(out).not.toContain("<img");
    expect(out).toContain("Before");
    expect(out).toContain("After");
  });

  it("strips <figure>/<figcaption> wrappers", () => {
    const out = sanitizeHtml('<figure><img src="a.png"><figcaption>Cap</figcaption></figure>');
    expect(out).not.toContain("<figure");
    expect(out).not.toContain("<figcaption");
    expect(out).not.toContain("<img");
  });

  it("keeps iframe embeds (YouTube/CodePen)", () => {
    const out = sanitizeHtml('<iframe src="https://www.youtube-nocookie.com/embed/x" allowfullscreen></iframe>');
    expect(out).toContain("<iframe");
    expect(out).toContain("youtube-nocookie.com/embed/x");
  });

  it("drops an iframe whose src is not an allow-listed embed host", () => {
    const out = sanitizeHtml('<p>x</p><iframe src="https://evil.example/frame"></iframe><p>y</p>');
    expect(out).not.toContain("<iframe");
    expect(out).not.toContain("evil.example");
    expect(out).toContain("x");
    expect(out).toContain("y");
  });

  it("keeps a CodePen embed iframe", () => {
    const out = sanitizeHtml('<iframe src="https://codepen.io/u/embed/abc"></iframe>');
    expect(out).toContain("<iframe");
    expect(out).toContain("codepen.io/u/embed/abc");
  });

  it("keeps ordinary text formatting", () => {
    const out = sanitizeHtml("<p><strong>Bold</strong> and <em>italic</em></p>");
    expect(out).toContain("<strong>Bold</strong>");
    expect(out).toContain("<em>italic</em>");
  });

  it("strips the inline style attribute (clickjacking-overlay vector)", () => {
    const out = sanitizeHtml(
      '<a href="https://x.example" style="position:fixed;inset:0;width:100vw;height:100vh;opacity:0">.</a>',
    );
    expect(out).not.toContain("style=");
    expect(out).not.toContain("position:fixed");
    expect(out).toContain("href=");
  });

  it("strips <style>/<svg>/<math> (CSS-exfil / mXSS-wrapper vectors)", () => {
    const out = sanitizeHtml(
      '<p>ok</p><svg><style>@import url(https://evil.example/x)</style></svg><math><mtext>m</mtext></math>',
    );
    expect(out).not.toContain("<style");
    expect(out).not.toContain("<svg");
    expect(out).not.toContain("<math");
    expect(out).not.toContain("@import");
    expect(out).toContain("ok");
  });

  // Allowlist sanitizers can over-strip — these assert legit rendered-markdown shapes
  // (from lib/markdown/postprocess.ts) survive sanitization.
  it("preserves links, lists, headings, code, blockquote, sup", () => {
    const out = sanitizeHtml(
      '<h2>Title</h2><p><a href="https://x.example">link</a> <code>x</code></p>' +
        '<ul><li>one</li></ul><blockquote><p>q</p></blockquote><sup>1</sup>',
    );
    for (const frag of ["<h2>", '<a href="https://x.example"', "<code>", "<ul>", "<li>", "<blockquote>", "<sup>"]) {
      expect(out).toContain(frag);
    }
  });

  it("preserves GFM tables", () => {
    const out = sanitizeHtml("<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>");
    for (const t of ["<table>", "<thead>", "<tbody>", "<tr>", "<th>", "<td>"]) expect(out).toContain(t);
  });

  it("preserves callout + footnote wrappers (class/id/data-fn attrs)", () => {
    const callout = '<div class="callout callout-note"><div class="callout-title">ℹ️ NOTE</div><p>body</p></div>';
    expect(sanitizeHtml(callout)).toContain('class="callout callout-note"');
    const fnRef = '<sup><a href="#fn-1" class="lb-fn-ref" data-fn="1" data-fn-text="t">1</a></sup>';
    const refOut = sanitizeHtml(fnRef);
    expect(refOut).toContain('href="#fn-1"');
    expect(refOut).toContain('data-fn="1"');
    const fnItem = '<div class="lb-footnote-item" id="fn-1"><span class="lb-footnote-num">1.</span></div>';
    expect(sanitizeHtml(fnItem)).toContain('id="fn-1"');
  });

  // The highlight renderer (lib/markdown/highlight.ts via lib/markdown/parse.ts)
  // emits pre[data-lang] + hljs token spans — pin that the allowlist keeps them.
  it("preserves highlighted code blocks (pre data-lang + hljs span classes)", () => {
    const block =
      '<pre data-lang="ts"><code class="hljs language-ts">' +
      '<span class="hljs-keyword">const</span> x = <span class="hljs-string">&quot;hi&quot;</span>' +
      "</code></pre>";
    const out = sanitizeHtml(block);
    expect(out).toContain('data-lang="ts"');
    expect(out).toContain('class="hljs language-ts"');
    expect(out).toContain('<span class="hljs-keyword">const</span>');
  });

  it("keeps data-lang only on pre, not on arbitrary tags", () => {
    expect(sanitizeHtml('<p data-lang="x">t</p>')).toBe("<p>t</p>");
  });
});
