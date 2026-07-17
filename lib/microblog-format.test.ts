import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { relTime, readingTime, fmtContent } from "@/lib/microblog-format";

describe("relTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-12T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

  it("covers each unit boundary", () => {
    expect(relTime(ago(59 * 1000))).toBe("just now");
    expect(relTime(ago(60 * 1000))).toBe("1m ago");
    expect(relTime(ago(59 * 60 * 1000))).toBe("59m ago");
    expect(relTime(ago(60 * 60 * 1000))).toBe("1h ago");
    expect(relTime(ago(23 * 60 * 60 * 1000))).toBe("23h ago");
    expect(relTime(ago(24 * 60 * 60 * 1000))).toBe("1d ago");
    expect(relTime(ago(7 * 24 * 60 * 60 * 1000))).toBe("1w ago");
    expect(relTime(ago(29 * 24 * 60 * 60 * 1000))).toBe("4w ago");
  });

  it("falls back to a short date at 30+ days", () => {
    expect(relTime(ago(40 * 24 * 60 * 60 * 1000))).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
  });

  it("clamps future dates to 'just now'", () => {
    expect(relTime(new Date(Date.now() + 60_000).toISOString())).toBe("just now");
  });
});

describe("readingTime", () => {
  it("floors at 1 and rounds up past 200 words", () => {
    expect(readingTime("")).toBe("1 min read");
    expect(readingTime(Array(201).fill("w").join(" "))).toBe("2 min read");
  });
});

describe("fmtContent", () => {
  it("escapes HTML before applying inline formatting", () => {
    expect(fmtContent("**bold** & <b>raw</b>")).toBe(
      "<strong>bold</strong> &amp; &lt;b&gt;raw&lt;/b&gt;",
    );
  });

  it("renders spoilers, code, strikethrough, and em", () => {
    expect(fmtContent("|||secret|||")).toContain('class="blog-spoiler"');
    expect(fmtContent("`code`")).toBe("<code>code</code>");
    expect(fmtContent("~~gone~~")).toBe("<s>gone</s>");
    expect(fmtContent("*em*")).toBe("<em>em</em>");
  });

  it("links hashtags", () => {
    expect(fmtContent("#agile")).toBe('<span class="hashtag" data-tag="agile">#agile</span>');
  });

  it("embeds YouTube links without autolinking the iframe src", () => {
    const out = fmtContent("https://youtu.be/dQw4w9WgXcQ");
    expect(out).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ");
    // The lookbehind must not wrap the embed's src URL in an anchor.
    expect(out).not.toContain("<a ");
  });

  it("autolinks bare URLs", () => {
    const out = fmtContent("see https://example.com/page for more");
    expect(out).toContain('<a href="https://example.com/page"');
    expect(out).toContain('rel="noopener"');
  });

  it("keeps a URL #fragment in the link instead of turning it into a hashtag", () => {
    const out = fmtContent("read https://en.wikipedia.org/wiki/Foo#History now");
    // The whole URL (including the fragment) is the anchor href...
    expect(out).toContain('<a href="https://en.wikipedia.org/wiki/Foo#History"');
    // ...and no spurious hashtag chip is injected mid-URL.
    expect(out).not.toContain('data-tag="History"');
  });

  it("still links a standalone hashtag that follows a URL", () => {
    const out = fmtContent("https://example.com #agile");
    expect(out).toContain('<a href="https://example.com"');
    expect(out).toContain('data-tag="agile"');
  });

  it("does not reinterpret markdown/URLs/hashtags inside a fenced code block", () => {
    const out = fmtContent("```\n**not bold** `x` ~~keep~~ #tag https://example.com\n```");
    expect(out).toBe("<pre>**not bold** `x` ~~keep~~ #tag https://example.com</pre>");
    expect(out).not.toContain("<strong>");
    expect(out).not.toContain("hashtag");
    expect(out).not.toContain("<a ");
    // No leftover sentinel in the output.
    expect(out).not.toMatch(/<!--CB/);
  });

  it("restores multiple fenced blocks and still formats text around them", () => {
    const out = fmtContent("```\n**a**\n```\nreal **bold**\n```\n**b**\n```");
    expect(out).toContain("<pre>**a**</pre>");
    expect(out).toContain("<pre>**b**</pre>");
    expect(out).toContain("real <strong>bold</strong>");
  });
});
