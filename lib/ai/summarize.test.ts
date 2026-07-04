import { describe, it, expect } from "vitest";
import { cleanTldr, buildTldrUserContent, MAX_TLDR, MAX_SUMMARY_CONTENT } from "@/lib/ai/summarize";

describe("cleanTldr", () => {
  it("strips markup, control chars and surrounding quotes", () => {
    expect(cleanTldr('  "Ships are <b>safe</b> in harbor.\x07"  ')).toBe(
      "Ships are safe in harbor.",
    );
    expect(cleanTldr("“Curly quoted.”")).toBe("Curly quoted.");
  });

  it("caps at MAX_TLDR chars", () => {
    expect(cleanTldr("x".repeat(2000)).length).toBe(MAX_TLDR);
  });

  it("returns empty string for markup-only output", () => {
    expect(cleanTldr("<p></p>")).toBe("");
  });
});

describe("buildTldrUserContent", () => {
  it("prefixes the title and truncates the body", () => {
    const out = buildTldrUserContent("My Title", "b".repeat(100_000));
    expect(out.startsWith("Title: My Title\n\nArticle:\n")).toBe(true);
    expect(out.length).toBeLessThanOrEqual("Title: My Title\n\nArticle:\n".length + MAX_SUMMARY_CONTENT);
  });

  it("omits the title line when blank", () => {
    expect(buildTldrUserContent("  ", "body")).toBe("Article:\nbody");
  });
});

describe("ReDoS guard (cleanTldr runs on model output server-side)", () => {
  it("is linear on a long '<' run", () => {
    const t = performance.now();
    cleanTldr("<".repeat(200_000));
    expect(performance.now() - t).toBeLessThan(3000);
  });
});
