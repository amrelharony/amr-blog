import { describe, it, expect } from "vitest";
import { normalizeSuggestedTags, TAG_VOCABULARY, MAX_SUGGESTED } from "@/lib/ai/tags";

describe("normalizeSuggestedTags", () => {
  it("parses a clean JSON array and keeps vocabulary tags", () => {
    const out = normalizeSuggestedTags('["fintech", "leadership"]', []);
    expect(out).toEqual(["fintech", "leadership"]);
  });

  it("parses JSON embedded in chatter", () => {
    const out = normalizeSuggestedTags('Sure! Here you go: ["banking", "fintech"] Hope that helps.', []);
    expect(out).toEqual(["banking", "fintech"]);
  });

  it("falls back to comma/newline splitting", () => {
    expect(normalizeSuggestedTags("fintech, leadership\nbanking", [])).toEqual([
      "fintech",
      "leadership",
      "banking",
    ]);
    expect(normalizeSuggestedTags('- "fintech"\n- "agile"', [])).toEqual(["fintech", "agile"]);
  });

  it("drops off-vocabulary and hallucinated tags entirely", () => {
    expect(normalizeSuggestedTags('["blockchain-wizardry", "made-up"]', [])).toEqual([]);
    expect(normalizeSuggestedTags("total garbage output", [])).toEqual([]);
  });

  it("is case-insensitive against the vocabulary", () => {
    expect(normalizeSuggestedTags('["FinTech", "LEADERSHIP"]', [])).toEqual([
      "fintech",
      "leadership",
    ]);
  });

  it("never duplicates existing tags and appends after them", () => {
    const out = normalizeSuggestedTags('["fintech", "banking"]', ["fintech", "custom-tag"]);
    expect(out).toEqual(["fintech", "custom-tag", "banking"]);
  });

  it("caps new suggestions at MAX_SUGGESTED", () => {
    const raw = JSON.stringify(TAG_VOCABULARY.slice(0, 10));
    const out = normalizeSuggestedTags(raw, []);
    expect(out).toHaveLength(MAX_SUGGESTED);
  });

  it("caps total tags at 20", () => {
    const existing = Array.from({ length: 19 }, (_, i) => `existing-${i}`);
    const out = normalizeSuggestedTags('["fintech", "banking", "agile"]', existing);
    expect(out).toHaveLength(20);
  });

  it("survives malformed JSON without throwing", () => {
    expect(normalizeSuggestedTags('["fintech", ', [])).toEqual(["fintech"]);
    expect(normalizeSuggestedTags("[{bad json]", [])).toEqual([]);
    expect(normalizeSuggestedTags("", [])).toEqual([]);
  });
});

describe("ReDoS guard (normalizeSuggestedTags runs on model output server-side)", () => {
  const BUDGET_MS = 3000;
  const timed = (fn: () => void) => {
    const t = performance.now();
    fn();
    return performance.now() - t;
  };

  it("is linear on a pathological bracket/quote run", () => {
    const evil = "[" + '"'.repeat(100_000);
    expect(timed(() => normalizeSuggestedTags(evil, []))).toBeLessThan(BUDGET_MS);
  });

  it("is linear on a long dash/space run (list-splitting path)", () => {
    const evil = ("- " + " ".repeat(30)).repeat(10_000);
    expect(timed(() => normalizeSuggestedTags(evil, []))).toBeLessThan(BUDGET_MS);
  });
});
