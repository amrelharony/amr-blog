import { describe, it, expect } from "vitest";
import { createIpWindow, clientIpFrom } from "@/lib/rate-limit/ip-window";

describe("createIpWindow", () => {
  it("allows requests under the limit", () => {
    const w = createIpWindow({ limit: 3, windowMs: 60_000 });
    const t = 1_000_000;
    expect(w.check("1.2.3.4", t).allowed).toBe(true);
    expect(w.check("1.2.3.4", t + 1).allowed).toBe(true);
    expect(w.check("1.2.3.4", t + 2).allowed).toBe(true);
  });

  it("blocks past the limit with a sane Retry-After", () => {
    const w = createIpWindow({ limit: 2, windowMs: 60_000 });
    const t = 1_000_000;
    w.check("ip", t);
    w.check("ip", t + 1000);
    const blocked = w.check("ip", t + 30_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBe(30); // window started at t, 30s remain
  });

  it("reports at least 1s Retry-After at the window edge", () => {
    const w = createIpWindow({ limit: 1, windowMs: 60_000 });
    const t = 0;
    w.check("ip", t);
    expect(w.check("ip", t + 59_999).retryAfterSec).toBe(1);
  });

  it("resets on window rollover", () => {
    const w = createIpWindow({ limit: 1, windowMs: 60_000 });
    const t = 0;
    expect(w.check("ip", t).allowed).toBe(true);
    expect(w.check("ip", t + 1).allowed).toBe(false);
    expect(w.check("ip", t + 60_000).allowed).toBe(true); // exactly one window later
    expect(w.check("ip", t + 60_001).allowed).toBe(false); // new window counts again
  });

  it("tracks IPs independently", () => {
    const w = createIpWindow({ limit: 1, windowMs: 60_000 });
    expect(w.check("a", 0).allowed).toBe(true);
    expect(w.check("b", 0).allowed).toBe(true);
    expect(w.check("a", 1).allowed).toBe(false);
    expect(w.check("b", 1).allowed).toBe(false);
  });

  it("fails open on an empty key", () => {
    const w = createIpWindow({ limit: 1, windowMs: 60_000 });
    for (let i = 0; i < 10; i++) expect(w.check("", i).allowed).toBe(true);
  });
});

describe("clientIpFrom", () => {
  it("prefers x-real-ip", () => {
    const h = new Headers({ "x-real-ip": " 1.2.3.4 ", "x-forwarded-for": "9.9.9.9" });
    expect(clientIpFrom(h)).toBe("1.2.3.4");
  });
  it("falls back to the first x-forwarded-for hop", () => {
    const h = new Headers({ "x-forwarded-for": "5.6.7.8, 10.0.0.1" });
    expect(clientIpFrom(h)).toBe("5.6.7.8");
  });
  it("returns empty string when neither header is set", () => {
    expect(clientIpFrom(new Headers())).toBe("");
  });
});
