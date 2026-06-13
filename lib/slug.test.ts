import { describe, it, expect } from "vitest";
import { isSlugTaken } from "@/lib/slug";

const items = [
  { id: "1", slug: "agile-basics" },
  { id: "2", slug: "FinTech-101" },
];

describe("isSlugTaken", () => {
  it("flags a slug used by another article (case-insensitive)", () => {
    expect(isSlugTaken("agile-basics", "new", items)).toBe(true);
    expect(isSlugTaken("fintech-101", "new", items)).toBe(true);
  });

  it("does not flag the article's own slug while editing it", () => {
    expect(isSlugTaken("agile-basics", "1", items)).toBe(false);
  });

  it("treats an unused or empty slug as free", () => {
    expect(isSlugTaken("brand-new", "new", items)).toBe(false);
    expect(isSlugTaken("   ", "new", items)).toBe(false);
  });

  it("ignores surrounding whitespace", () => {
    expect(isSlugTaken("  agile-basics  ", "new", items)).toBe(true);
  });
});
