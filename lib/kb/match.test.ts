import { describe, it, expect } from "vitest";
import { matchQuery, buildContext, matchedCats } from "./match";

describe("matchQuery", () => {
  it("returns the welcome state for an empty query", () => {
    expect(matchQuery("   ").confidence).toBe("welcome");
    expect(matchQuery("").matches).toEqual([]);
  });

  it("matches a known topic with a real score", () => {
    const r = matchQuery("tell me about agile and scrum");
    expect(r.topScore).toBeGreaterThan(0);
    expect(r.matches.length).toBeGreaterThan(0);
    expect(Number.isFinite(r.topScore)).toBe(true);
  });

  // The synonym/frequency maps are indexed by ngrams built from the visitor's own
  // message. As plain `{}` they resolved these keys through Object.prototype:
  // SYNONYMS["constructor"] handed back the Object constructor, which passed the
  // truthiness check and then threw "syns is not iterable" — a 500 on /api/chat for
  // any message containing the word.
  it.each(["constructor", "__proto__", "toString", "valueOf", "hasOwnProperty"])(
    "does not crash on a query containing %s",
    (word) => {
      expect(() => matchQuery(`what about ${word} here`)).not.toThrow();
    },
  );

  it("scores stay finite when a query term shadows a prototype member", () => {
    const r = matchQuery("constructor agile scrum");
    expect(Number.isNaN(r.topScore)).toBe(false);
  });

  it("buildContext and matchedCats tolerate the same input", () => {
    const r = matchQuery("__proto__ constructor");
    expect(typeof buildContext(r)).toBe("string");
    expect(Array.isArray(matchedCats(r))).toBe(true);
  });
});
