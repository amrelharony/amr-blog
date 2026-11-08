import { describe, it, expect, vi, beforeEach } from "vitest";

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

import {
  tagKeyForms,
  tagPagePaths,
  revalidateTagPages,
  revalidateAllTagPages,
  MAX_REVALIDATE_TAGS,
} from "./tag-pages";

beforeEach(() => revalidatePath.mockClear());

describe("tagKeyForms", () => {
  it("is a single form for a plain tag", () => {
    expect(tagKeyForms("fintech")).toEqual(["fintech"]);
  });

  it("adds the encoded form for a tag with a space", () => {
    // 73% of tags contain a space; the encoded form is the key a still-encoded
    // param (and the /feed/tag route handler) caches under.
    expect(tagKeyForms("ai productivity")).toEqual(["ai productivity", "ai%20productivity"]);
  });

  it("escapes path delimiters the way Next keys the page", () => {
    // revalidatePath("/tag/tcp/ip") never matched: Next keys this page "/tag/tcp%2Fip".
    expect(tagKeyForms("tcp/ip")).toEqual(["tcp%2Fip", "tcp%252Fip"]);
    expect(tagKeyForms("a/b testing")).toEqual([
      "a%2Fb testing",
      "a%252Fb%20testing",
      "a%2Fb%20testing",
    ]);
  });
});

describe("tagPagePaths", () => {
  it("covers both the tag page and the tag feed", () => {
    expect(tagPagePaths(["fintech"])).toEqual(["/tag/fintech", "/feed/tag/fintech"]);
  });

  it("trims, dedupes and skips junk", () => {
    expect(tagPagePaths([" fintech ", "fintech", "", "   ", 42, null, "x".repeat(101)])).toEqual([
      "/tag/fintech",
      "/feed/tag/fintech",
    ]);
  });

  it("caps the number of tags", () => {
    const tags = Array.from({ length: MAX_REVALIDATE_TAGS + 10 }, (_, i) => `t${i}`);
    expect(tagPagePaths(tags)).toHaveLength(MAX_REVALIDATE_TAGS * 2);
  });
});

describe("revalidateTagPages", () => {
  it("revalidates every key form of every tag", () => {
    revalidateTagPages(["ai productivity"]);
    expect(revalidatePath.mock.calls.map((c) => c[0])).toEqual([
      "/tag/ai productivity",
      "/feed/tag/ai productivity",
      "/tag/ai%20productivity",
      "/feed/tag/ai%20productivity",
    ]);
  });

  it("is a no-op for no tags", () => {
    revalidateTagPages([]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("revalidateAllTagPages", () => {
  it("uses the route patterns with the type each route kind is tagged with", () => {
    revalidateAllTagPages();
    expect(revalidatePath.mock.calls).toEqual([
      ["/tag/[tag]", "page"],
      ["/feed/tag/[tag]", "layout"],
    ]);
  });
});
