import { describe, it, expect } from "vitest";
import { assignHeadingIds } from "@/lib/toc";

const h = (tag: string, text: string, existingId?: string) => ({ tag, text, existingId });

describe("assignHeadingIds", () => {
  it("derives ids from slugified text and maps depth from the tag", () => {
    const out = assignHeadingIds([h("H2", "Getting Started"), h("h3", "Why It Matters")]);
    expect(out).toEqual([
      { id: "getting-started", text: "Getting Started", depth: 2 },
      { id: "why-it-matters", text: "Why It Matters", depth: 3 },
    ]);
  });

  it("falls back to 'section' for empty/punctuation-only headings", () => {
    const out = assignHeadingIds([h("H2", "  "), h("H2", "!!!")]);
    expect(out[0].id).toBe("section");
    expect(out[1].id).toBe("section-2"); // second empty must not collide
  });

  it("suffixes duplicate headings", () => {
    const out = assignHeadingIds([h("H2", "Setup"), h("H2", "Setup")]);
    expect(out.map((x) => x.id)).toEqual(["setup", "setup-2"]);
  });

  it("resolves the triple-collision the old inline logic got wrong", () => {
    // "Setup", "Setup" → setup, setup-2; then "Setup 2" slugifies to setup-2
    // and must be bumped to setup-2-2 rather than reusing setup-2.
    const out = assignHeadingIds([h("H2", "Setup"), h("H2", "Setup"), h("H2", "Setup 2")]);
    const ids = out.map((x) => x.id);
    expect(ids).toEqual(["setup", "setup-2", "setup-2-2"]);
    expect(new Set(ids).size).toBe(3);
  });

  it("honors an author-supplied existing id", () => {
    const out = assignHeadingIds([h("H2", "Whatever", "custom-anchor")]);
    expect(out[0].id).toBe("custom-anchor");
  });
});
