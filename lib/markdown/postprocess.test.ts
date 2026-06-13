import { describe, it, expect } from "vitest";
import {
  postProcessHtml,
  processEmbeds,
  processFootnotes,
  processGalleries,
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

  it("HTML-escapes definition text in attributes", () => {
    const out = processFootnotes('<p>x[^q]</p><p>[^q]: uses "quotes" &amp; stuff</p>');
    expect(out).toContain("data-fn-text=\"uses &quot;quotes&quot; &amp;amp; stuff\"");
  });
});

describe("processGalleries", () => {
  it("injects lazy loading on images that lack it, and only those", () => {
    const out = processGalleries('<img src="a.png"><img loading="eager" src="b.png">');
    expect(out).toContain('<img loading="lazy" decoding="async" src="a.png">');
    expect(out).toContain('<img loading="eager" src="b.png">');
  });

  it("wraps a lone image paragraph in a figure with alt-derived caption", () => {
    const out = processGalleries('<p><img loading="lazy" src="a.png" alt="A chart"></p>');
    expect(out).toContain("<figure><img");
    expect(out).toContain("<figcaption>A chart</figcaption>");
  });

  it("omits figcaption when alt is empty", () => {
    const out = processGalleries('<p><img loading="lazy" src="a.png" alt=""></p>');
    expect(out).toContain("<figure><img");
    expect(out).not.toContain("<figcaption>");
  });

  it("groups two or more consecutive figures into a gallery without captions", () => {
    const out = processGalleries(
      '<p><img loading="lazy" src="a.png" alt="One"></p>\n<p><img loading="lazy" src="b.png" alt="Two"></p>',
    );
    expect(out).toContain('class="lb-gallery"');
    expect(out).not.toContain("<figure>");
    expect(out).not.toContain("<figcaption>");
  });

  it("keeps a single figure out of gallery markup", () => {
    const out = processGalleries('<p><img loading="lazy" src="a.png" alt="One"></p>');
    expect(out).not.toContain("lb-gallery");
  });
});
