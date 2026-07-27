import { describe, it, expect } from "vitest";
import { pgTextArrayLiteral } from "./articles";

// postgrest-js's contains(column, array) serializes as `cs.{a,b}` with a raw
// join(",") — no quoting. These cases are the ones that used to change the meaning
// of the filter or make PostgREST reject it outright.
describe("pgTextArrayLiteral", () => {
  it("quotes a plain tag", () => {
    expect(pgTextArrayLiteral(["fintech"])).toBe('{"fintech"}');
  });

  it("keeps a comma inside one element instead of splitting it into two tags", () => {
    // Unquoted this was `{AI,ML}` — 'has BOTH the AI and ML tags', not the literal tag.
    expect(pgTextArrayLiteral(["AI,ML"])).toBe('{"AI,ML"}');
  });

  it("survives braces, which used to produce a malformed array literal (PostgREST 400)", () => {
    expect(pgTextArrayLiteral(["}"])).toBe('{"}"}');
    expect(pgTextArrayLiteral(["{a}"])).toBe('{"{a}"}');
  });

  it("escapes backslashes and double quotes", () => {
    expect(pgTextArrayLiteral(['a"b'])).toBe('{"a\\"b"}');
    expect(pgTextArrayLiteral(["a\\b"])).toBe('{"a\\\\b"}');
    // A trailing backslash must not escape the closing quote.
    expect(pgTextArrayLiteral(["a\\"])).toBe('{"a\\\\"}');
  });

  it("handles spaces and an empty tag", () => {
    expect(pgTextArrayLiteral(["digital banking"])).toBe('{"digital banking"}');
    expect(pgTextArrayLiteral([""])).toBe('{""}');
  });

  it("joins multiple values", () => {
    expect(pgTextArrayLiteral(["a", "b"])).toBe('{"a","b"}');
  });
});
