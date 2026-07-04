import { describe, it, expect } from "vitest";
import { buildEmbeddingInput, MAX_EMBED_INPUT_CHARS } from "@/lib/embeddings";

describe("buildEmbeddingInput", () => {
  it("joins title, tldr, excerpt and body head with blank lines", () => {
    const out = buildEmbeddingInput({
      title: "Title",
      tldr: "The gist.",
      excerpt: "Teaser.",
      content: "Body text here.",
    });
    expect(out).toBe("Title\n\nThe gist.\n\nTeaser.\n\nBody text here.");
  });

  it("skips missing parts without leaving separators", () => {
    expect(buildEmbeddingInput({ title: "T", tldr: null, excerpt: "", content: null })).toBe("T");
    expect(buildEmbeddingInput({ title: "T", content: "B" })).toBe("T\n\nB");
  });

  it("takes only the head of a long body and caps the total length", () => {
    const out = buildEmbeddingInput({ title: "T", content: "x".repeat(50_000) });
    expect(out.length).toBeLessThanOrEqual(MAX_EMBED_INPUT_CHARS);
    // body contribution capped at 1,500 chars
    expect(out).toBe("T\n\n" + "x".repeat(1500));
  });

  it("returns empty string when there is nothing to embed", () => {
    expect(buildEmbeddingInput({ title: "  ", content: " " })).toBe("");
  });
});
