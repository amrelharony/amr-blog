import { describe, it, expect } from "vitest";
import {
  isValidConfirmToken,
  isValidConfirmRequest,
  confirmationSucceeded,
} from "@/lib/newsletter/confirm";

describe("isValidConfirmToken", () => {
  it("accepts URL-safe tokens within the length cap", () => {
    expect(isValidConfirmToken("abc-DEF_123")).toBe(true);
    expect(isValidConfirmToken("a".repeat(500))).toBe(true);
  });
  it("rejects missing, oversized, and out-of-charset tokens", () => {
    expect(isValidConfirmToken(null)).toBe(false);
    expect(isValidConfirmToken("")).toBe(false);
    expect(isValidConfirmToken("a".repeat(501))).toBe(false);
    for (const bad of ["a b", "a;b", "a%20b", "../etc", "a.b", "a/b", "⟦x⟧"]) {
      expect(isValidConfirmToken(bad)).toBe(false);
    }
  });
});

describe("isValidConfirmRequest", () => {
  const uuid = "123e4567-e89b-12d3-a456-426614174000";
  it("accepts a plausible email with a UUID-shaped token", () => {
    expect(isValidConfirmRequest("user@example.com", uuid)).toBe(true);
    expect(isValidConfirmRequest("user+tag@sub.example.co", uuid)).toBe(true);
    expect(isValidConfirmRequest("u@e.c", uuid.toUpperCase())).toBe(true); // case-insensitive token
  });
  it("rejects bad emails", () => {
    for (const bad of ["", "no-at.com", "a @b.com", "a@b", "a@b.", 42, null, "a".repeat(250) + "@example.com"]) {
      expect(isValidConfirmRequest(bad as unknown, uuid)).toBe(false);
    }
  });
  it("rejects bad tokens (length must be exactly 36)", () => {
    expect(isValidConfirmRequest("user@example.com", uuid.slice(0, 35))).toBe(false);
    expect(isValidConfirmRequest("user@example.com", uuid + "0")).toBe(false);
    expect(isValidConfirmRequest("user@example.com", "z".repeat(36))).toBe(false);
    expect(isValidConfirmRequest("user@example.com", 42)).toBe(false);
    expect(isValidConfirmRequest("user@example.com", null)).toBe(false);
  });
});

describe("confirmationSucceeded", () => {
  it("fails only on an explicit false body (the PostgREST 200-on-false subtlety)", () => {
    expect(confirmationSucceeded(true, false)).toBe(false);
    expect(confirmationSucceeded(true, true)).toBe(true);
    // any non-false shape must NOT regress a valid confirmation
    expect(confirmationSucceeded(true, null)).toBe(true);
    expect(confirmationSucceeded(true, undefined)).toBe(true);
    expect(confirmationSucceeded(true, "garbage")).toBe(true);
    expect(confirmationSucceeded(true, { ok: false })).toBe(true);
  });
  it("fails when the HTTP call itself failed", () => {
    expect(confirmationSucceeded(false, true)).toBe(false);
    expect(confirmationSucceeded(false, false)).toBe(false);
  });
});
