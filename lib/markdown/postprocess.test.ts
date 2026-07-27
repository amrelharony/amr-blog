import { describe, it, expect } from "vitest";
import {
  postProcessHtml,
  processEmbeds,
  processFootnotes,
} from "@/lib/markdown/postprocess";

// Inputs mirror marked's actual blockquote/paragraph output shapes.
const bq = (inner: string) => `<blockquote>\n<p>${inner}</p>\n</blockquote>`;

describe("postProcessHtml (callouts)", () => {
  const cases: Array<[string, string]> = [
    ["NOTE", "note"],
    ["TIP", "tip"],
    ["WARNING", "warning"],
    ["DANGER", "danger"],
    ["IMPORTANT", "warning"],
    ["CAUTION", "danger"],
    ["QUOTE", "quote"],
  ];

  it.each(cases)("converts [!%s] blockquotes to callout-%s", (type, cls) => {
    const out = postProcessHtml(bq(`[!${type}]<br>Body text`));
    expect(out).toContain(`class="callout callout-${cls}"`);
    expect(out).toContain(`${type}</div><p>Body text</p>`);
    expect(out).not.toContain("<blockquote>");
  });

  it("accepts self-closing <br/> and is case-insensitive", () => {
    expect(postProcessHtml(bq("[!note]<br/>x"))).toContain("callout-note");
  });

  it("leaves plain blockquotes untouched", () => {
    const plain = bq("Just a quote");
    expect(postProcessHtml(plain)).toBe(plain);
  });
});

describe("processEmbeds", () => {
  it("embeds youtube.com/watch?v= links", () => {
    const out = processEmbeds("<p>https://www.youtube.com/watch?v=dQw4w9WgXcQ</p>");
    expect(out).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(out).toContain('class="lb-embed"');
  });

  it("embeds youtu.be short links, including anchor-wrapped ones", () => {
    const out = processEmbeds(
      '<p><a href="https://youtu.be/dQw4w9WgXcQ">https://youtu.be/dQw4w9WgXcQ</a></p>',
    );
    expect(out).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ");
  });

  it("embeds x.com and twitter.com status links", () => {
    for (const host of ["x.com", "twitter.com"]) {
      const out = processEmbeds(`<p>https://${host}/someuser/status/123456789</p>`);
      expect(out).toContain('href="https://twitter.com/someuser/status/123456789"');
      expect(out).toContain("twitter-tweet");
    }
  });

  it("embeds codepen pen links", () => {
    const out = processEmbeds("<p>https://codepen.io/some-user/pen/AbCdEf</p>");
    expect(out).toContain("codepen.io/some-user/embed/AbCdEf");
  });

  it("ignores youtube links inside running text", () => {
    const html = "<p>watch this https://youtu.be/dQw4w9WgXcQ later</p>";
    expect(processEmbeds(html)).toBe(html);
  });
});

describe("processFootnotes", () => {
  it("links refs to definitions and appends a footnotes section", () => {
    const out = processFootnotes("<p>Claim[^1]</p><p>[^1]: The source</p>");
    expect(out).toContain('href="#fn-1"');
    expect(out).toContain('data-fn-text="The source"');
    expect(out).toContain('class="lb-footnotes"');
    expect(out).toContain('id="fn-1"');
    expect(out).not.toContain("[^1]:");
  });

  it("resolves refs that appear before their definition", () => {
    const out = processFootnotes("<p>[^a]: Defined late</p><p>Early ref[^a]</p>");
    expect(out).toContain('data-fn-text="Defined late"');
  });

  it("leaves undefined refs as literal text and adds no section", () => {
    const out = processFootnotes("<p>Dangling[^nope]</p>");
    expect(out).toBe("<p>Dangling[^nope]</p>");
  });

  it("links a defined-but-empty footnote instead of leaving a broken literal ref", () => {
    const out = processFootnotes("<p>Claim[^1]</p><p>[^1]: </p>");
    // The ref must become an anchor (the definition existed, just empty)...
    expect(out).toContain('href="#fn-1"');
    // ...not be left as the literal "[^1]".
    expect(out).not.toMatch(/\[\^1\]/);
  });

  it("HTML-escapes definition text in attributes", () => {
    const out = processFootnotes('<p>x[^q]</p><p>[^q]: uses "quotes" &amp; stuff</p>');
    expect(out).toContain("data-fn-text=\"uses &quot;quotes&quot; &amp;amp; stuff\"");
  });

  // The ref map used to be a plain `{}`, so `id in refs` hit Object.prototype: an
  // UNdefined ref named after a prototype member resolved to the inherited function,
  // and esc() threw on it. renderArticleHtml has no try/catch at its call sites, so
  // one such ref 500'd the article page AND every feed that renders it.
  it.each(["toString", "constructor", "valueOf", "hasOwnProperty", "isPrototypeOf"])(
    "treats an undefined ref named %s as literal text, not an inherited property",
    (id) => {
      const out = processFootnotes(`<p>A claim[^${id}] here.</p>`);
      expect(out).toBe(`<p>A claim[^${id}] here.</p>`);
    },
  );

  it("still resolves a definition whose id shadows a prototype member", () => {
    const out = processFootnotes("<p>Claim[^toString]</p><p>[^toString]: Real source</p>");
    expect(out).toContain('data-fn-text="Real source"');
    expect(out).toContain('id="fn-toString"');
  });
});

describe("ReDoS guards (these regexes run server-side on agent content at render + build)", () => {
  // Worst-case backtracking inputs. The bounded (linear) code runs in well under a
  // second; an unbounded-quantifier regression is quadratic and takes tens of seconds
  // at this size, so the ceiling catches it without flaking on slow CI.
  const BUDGET_MS = 3000;
  const N = 200_000;
  const timed = (fn: () => void) => {
    const t = performance.now();
    fn();
    return performance.now() - t;
  };

  it("processEmbeds is linear on a <p> + long ASCII whitespace run", () => {
    expect(timed(() => processEmbeds("<p>" + " ".repeat(N) + "x"))).toBeLessThan(BUDGET_MS);
  });

  it("processEmbeds is linear on non-ASCII whitespace (NBSP / form-feed, which \\s matches)", () => {
    expect(timed(() => processEmbeds("<p>" + " \f".repeat(N / 2) + "x"))).toBeLessThan(BUDGET_MS);
  });

  it("processEmbeds still converts a real YouTube embed", () => {
    expect(processEmbeds("<p>https://youtu.be/dQw4w9WgXcQ</p>")).toContain(
      "youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
  });

  it("postProcessHtml (callout) is linear on an unclosed blockquote + whitespace run", () => {
    expect(timed(() => postProcessHtml("<blockquote>\n<p>[!NOTE]<br>" + " ".repeat(N) + "y"))).toBeLessThan(
      BUDGET_MS,
    );
  });

  it("processFootnotes is linear on a <p>[^x]: + whitespace run", () => {
    expect(timed(() => processFootnotes("<p>[^x]:" + " ".repeat(N) + "y"))).toBeLessThan(BUDGET_MS);
  });
});

