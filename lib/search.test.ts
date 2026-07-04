import { describe, it, expect } from "vitest";
import {
  sanitizeSearchQuery,
  queryTerms,
  rankSearchResults,
  stripMarkdown,
  buildSnippet,
  matchedTags,
  fuseResults,
} from "@/lib/search";

describe("sanitizeSearchQuery", () => {
  it("strips PostgREST .or() filter metacharacters", () => {
    // Commas separate or-conditions, parens group, quotes delimit values.
    expect(sanitizeSearchQuery('agile, (fintech) "quoted" back\\slash')).toBe(
      "agile fintech quoted back slash",
    );
  });

  it("collapses whitespace and control characters", () => {
    expect(sanitizeSearchQuery("  a \t\n b\x07 c  ")).toBe("a b c");
  });

  it("caps length at 100 characters without a trailing space", () => {
    const out = sanitizeSearchQuery(("word ".repeat(40)).trim());
    expect(out.length).toBeLessThanOrEqual(100);
    expect(out.endsWith(" ")).toBe(false);
  });

  it("returns empty string when nothing survives", () => {
    expect(sanitizeSearchQuery('(),"')).toBe("");
    expect(sanitizeSearchQuery("   ")).toBe("");
  });
});

describe("queryTerms", () => {
  it("lowercases and splits on whitespace", () => {
    expect(queryTerms("Agile FinTech")).toEqual(["agile", "fintech"]);
    expect(queryTerms("")).toEqual([]);
  });
});

describe("rankSearchResults", () => {
  const row = (over: Record<string, unknown>) => ({
    title: "",
    excerpt: "",
    content: "",
    tags: [] as string[],
    views: 0,
    created_at: "2026-01-01T00:00:00Z",
    ...over,
  });

  it("weights title > tag > excerpt > body", () => {
    const rows = [
      row({ title: "x", content: "agile everywhere", views: 999 }),
      row({ title: "Agile rituals" }),
      row({ title: "y", tags: ["agile"] }),
      row({ title: "z", excerpt: "thoughts on agile" }),
    ];
    const out = rankSearchResults(rows, "agile");
    expect(out.map((r) => r.title)).toEqual(["Agile rituals", "y", "z", "x"]);
  });

  it("breaks score ties by views then recency", () => {
    const rows = [
      row({ title: "agile a", views: 1, created_at: "2026-01-01T00:00:00Z" }),
      row({ title: "agile b", views: 1, created_at: "2026-02-01T00:00:00Z" }),
      row({ title: "agile c", views: 9 }),
    ];
    const out = rankSearchResults(rows, "agile");
    expect(out.map((r) => r.title)).toEqual(["agile c", "agile b", "agile a"]);
  });

  it("does not mutate the input", () => {
    const rows = [row({ title: "b agile" }), row({ title: "a", content: "agile" })];
    rankSearchResults(rows, "agile");
    expect(rows[0].title).toBe("b agile");
  });
});

describe("stripMarkdown", () => {
  it("flattens common markdown to plain text", () => {
    const md = "# Heading\n\nSome **bold** and a [link](https://x.com) plus ![alt text](img.png).";
    expect(stripMarkdown(md)).toBe("Heading Some bold and a link plus alt text.");
  });

  it("drops code fences, callout markers, html tags, and blockquote prefixes", () => {
    const md = "> [!NOTE]\n> careful\n\n```js\nconst x = 1;\n```\n<em>tag</em> end";
    const out = stripMarkdown(md);
    expect(out).not.toContain("const x");
    expect(out).not.toContain("[!NOTE]");
    expect(out).not.toContain("<em>");
    expect(out).toContain("careful");
    expect(out).toContain("end");
  });
});

describe("buildSnippet", () => {
  const body = `${"intro filler ".repeat(30)}NEEDLE in the middle ${"outro filler ".repeat(30)}`;

  it("windows around the first term hit with ellipses on both sides", () => {
    const snip = buildSnippet(body, "needle", 80);
    expect(snip).toContain("NEEDLE");
    expect(snip.startsWith("…")).toBe(true);
    expect(snip.endsWith("…")).toBe(true);
    expect(snip.length).toBeLessThanOrEqual(82 + 2);
  });

  it("falls back to the document head when no term matches", () => {
    const snip = buildSnippet(body, "zzznotthere", 40);
    expect(snip.startsWith("…")).toBe(false);
    expect(snip.endsWith("…")).toBe(true);
    expect(snip).toContain("intro filler");
  });

  it("returns empty string for empty content", () => {
    expect(buildSnippet("", "x")).toBe("");
  });

  it("matches case-insensitively against stripped markdown", () => {
    expect(buildSnippet("Short **Agile** note", "agile")).toBe("Short Agile note");
  });
});

describe("matchedTags", () => {
  it("returns unique tags that contain a query term, preserving casing", () => {
    const rows = [
      { tags: ["Agile", "fintech"] },
      { tags: ["agile", "scaling agile"] },
      { tags: null },
    ];
    expect(matchedTags(rows, "agile")).toEqual(["Agile", "scaling agile"]);
  });

  it("caps the result count", () => {
    const rows = [{ tags: ["a1", "a2", "a3"] }];
    expect(matchedTags(rows, "a", 2)).toEqual(["a1", "a2"]);
  });
});

describe("ReDoS guards (buildSnippet/stripMarkdown run on the full body for every /api/search hit)", () => {
  const BUDGET_MS = 3000;
  const N = 200_000;
  const timed = (fn: () => void) => {
    const t = performance.now();
    fn();
    return performance.now() - t;
  };

  it("buildSnippet is linear on a long '[' run", () => {
    expect(timed(() => buildSnippet("[".repeat(N), "x"))).toBeLessThan(BUDGET_MS);
  });

  it("buildSnippet is linear on a long '![' run", () => {
    expect(timed(() => buildSnippet("![".repeat(N), "x"))).toBeLessThan(BUDGET_MS);
  });

  it("stripMarkdown is linear on a long '<' run", () => {
    expect(timed(() => stripMarkdown("<".repeat(N)))).toBeLessThan(BUDGET_MS);
  });

  it("stripMarkdown still strips a normal link to its text", () => {
    expect(stripMarkdown("see [the docs](https://example.com/x) now")).toBe("see the docs now");
  });
});

describe("fuseResults (hybrid search reciprocal-rank fusion)", () => {
  const item = (slug: string) => ({ slug });
  const key = (x: { slug: string }) => x.slug;

  it("items present in both lists outrank single-list items", () => {
    const fts = [item("both"), item("fts-only")];
    const vec = [item("vec-only"), item("both")];
    const out = fuseResults(fts, vec, key, 12);
    expect(out[0].slug).toBe("both");
    expect(out.map((x) => x.slug)).toHaveLength(3); // deduped
  });

  it("preserves rank order within a single list and respects limit", () => {
    const a = [item("a1"), item("a2"), item("a3")];
    const out = fuseResults(a, [], key, 2);
    expect(out.map((x) => x.slug)).toEqual(["a1", "a2"]);
  });

  it("handles both lists empty", () => {
    expect(fuseResults([], [], key)).toEqual([]);
  });

  it("keeps the first-seen item object for duplicates (FTS copy wins)", () => {
    const ftsCopy = { slug: "x", from: "fts" };
    const vecCopy = { slug: "x", from: "vec" };
    const out = fuseResults<{ slug: string; from?: string }>([ftsCopy], [vecCopy], (i) => i.slug);
    expect(out[0].from).toBe("fts");
  });
});
