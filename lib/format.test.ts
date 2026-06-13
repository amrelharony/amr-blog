import { describe, it, expect } from "vitest";
import { esc, readingTime, fmtDate, slugify } from "@/lib/format";

describe("esc", () => {
  it("escapes the four HTML-sensitive characters", () => {
    expect(esc('<a href="x">&</a>')).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;");
  });

  it("escapes ampersands first so entities are not produced from later replacements", () => {
    // If & were escaped last, the &quot; produced for `"` would become &amp;quot;.
    expect(esc('"')).toBe("&quot;");
    expect(esc("&quot;")).toBe("&amp;quot;");
  });

  it("returns empty string for null and undefined", () => {
    expect(esc(null)).toBe("");
    expect(esc(undefined)).toBe("");
  });
});

describe("readingTime", () => {
  it("floors at 1 minute for empty or tiny input", () => {
    expect(readingTime("")).toBe("1 min read");
    expect(readingTime(null)).toBe("1 min read");
    expect(readingTime("one two three")).toBe("1 min read");
  });

  it("rounds up at the 200-words-per-minute boundary", () => {
    expect(readingTime(Array(200).fill("word").join(" "))).toBe("1 min read");
    expect(readingTime(Array(201).fill("word").join(" "))).toBe("2 min read");
  });

  it("ignores extra whitespace between words", () => {
    expect(readingTime("  a   b\t\nc  ")).toBe("1 min read");
  });
});

describe("fmtDate", () => {
  it("formats ISO dates as long en-US dates", () => {
    expect(fmtDate("2026-01-05T12:00:00Z")).toBe("January 5, 2026");
  });

  it("returns 'Unknown date' for unparseable input", () => {
    expect(fmtDate("not-a-date")).toBe("Unknown date");
  });
});

describe("slugify", () => {
  it("lowercases, strips punctuation, and dashes spaces", () => {
    expect(slugify("Hello, World!")).toBe("hello-world");
  });

  it("strips non-ASCII word characters", () => {
    expect(slugify("café crème")).toBe("caf-crme");
  });

  it("collapses underscores and whitespace runs into single dashes", () => {
    expect(slugify("a __ b\t c")).toBe("a-b-c");
  });

  it("trims leading/trailing dashes", () => {
    expect(slugify("--hello--")).toBe("hello");
  });

  it("caps output at 80 characters", () => {
    expect(slugify("x".repeat(200)).length).toBe(80);
  });

  it("returns empty string for null and undefined", () => {
    expect(slugify(null)).toBe("");
    expect(slugify(undefined)).toBe("");
  });
});
