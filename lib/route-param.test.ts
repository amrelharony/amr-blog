import { describe, it, expect } from "vitest";
import { decodeRouteParam } from "./route-param";

describe("decodeRouteParam", () => {
  it("leaves an already-decoded value untouched", () => {
    expect(decodeRouteParam("bitcoin halving")).toBe("bitcoin halving");
    expect(decodeRouteParam("fintech")).toBe("fintech");
    expect(decodeRouteParam("AI & Fintech")).toBe("AI & Fintech");
  });

  it("decodes a value Vercel passed through still percent-encoded", () => {
    // The production failure: /tag/bitcoin%20halving rendered with the encoded
    // string, matched no rows and 404'd.
    expect(decodeRouteParam("bitcoin%20halving")).toBe("bitcoin halving");
    expect(decodeRouteParam("40-hour%20workweek")).toBe("40-hour workweek");
    expect(decodeRouteParam("AI%20%26%20Fintech")).toBe("AI & Fintech");
  });

  it("decodes the double-encoded canonical the encoded render used to emit", () => {
    expect(decodeRouteParam("ai%2520productivity")).toBe("ai productivity");
  });

  it("decodes non-ASCII values", () => {
    expect(decodeRouteParam("caf%C3%A9")).toBe("café");
    expect(decodeRouteParam("café")).toBe("café");
  });

  it("keeps a literal % that is not an escape", () => {
    expect(decodeRouteParam("100%")).toBe("100%");
    expect(decodeRouteParam("50%off")).toBe("50%off");
  });

  it("never throws on a malformed sequence", () => {
    expect(decodeRouteParam("%E0%A4%A")).toBe("%E0%A4%A");
    // One good round, then a malformed remainder: keep the partially decoded value.
    expect(decodeRouteParam("%25E0%25A4%25A")).toBe("%E0%A4%A");
  });

  it("stops after a bounded number of rounds", () => {
    // Encoded four times; three rounds leave one layer.
    expect(decodeRouteParam("a%25252520b")).toBe("a%20b");
  });
});
