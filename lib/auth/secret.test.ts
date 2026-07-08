import { describe, it, expect } from "vitest";
import { secretMatches, bearerToken } from "@/lib/auth/secret";

describe("secretMatches", () => {
  it("matches an equal secret", () => {
    expect(secretMatches("s3cret", "s3cret")).toBe(true);
  });

  it("rejects a wrong or wrong-length secret without throwing", () => {
    expect(secretMatches("wrong", "s3cret")).toBe(false);
    expect(secretMatches("s3cre", "s3cret")).toBe(false); // length differs — hashing prevents a throw
    expect(secretMatches("s3crett", "s3cret")).toBe(false);
  });

  it("fails closed when the expected secret is unset", () => {
    expect(secretMatches("anything", undefined)).toBe(false);
    expect(secretMatches("", undefined)).toBe(false);
    expect(secretMatches(null, undefined)).toBe(false);
  });

  it("rejects an empty expected secret and a null presented value", () => {
    expect(secretMatches("", "")).toBe(false);
    expect(secretMatches(null, "s3cret")).toBe(false);
  });
});

describe("bearerToken", () => {
  it("extracts the token after 'Bearer '", () => {
    expect(bearerToken("Bearer abc123")).toBe("abc123");
  });

  it("returns null for missing/malformed headers", () => {
    expect(bearerToken(null)).toBe(null);
    expect(bearerToken("")).toBe(null);
    expect(bearerToken("bearer abc")).toBe(null); // case-sensitive, matches prior behavior
    expect(bearerToken("Token abc")).toBe(null);
  });
});
