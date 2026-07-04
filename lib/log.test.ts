import { describe, it, expect, vi, afterEach } from "vitest";
import { logEvent } from "@/lib/log";

describe("logEvent", () => {
  afterEach(() => vi.restoreAllMocks());

  it("emits a single parseable JSON line with ts, event, and fields", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logEvent("test.event", { a: 1, s: "x" });
    expect(spy).toHaveBeenCalledTimes(1);
    const line = spy.mock.calls[0][0] as string;
    expect(line).not.toContain("\n");
    const parsed = JSON.parse(line);
    expect(parsed.event).toBe("test.event");
    expect(new Date(parsed.ts).getTime()).not.toBeNaN();
    expect(parsed.a).toBe(1);
    expect(parsed.s).toBe("x");
  });

  it("works without fields", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logEvent("bare");
    expect(JSON.parse(spy.mock.calls[0][0] as string)).toMatchObject({ event: "bare" });
  });

  it("falls back to event-only when fields are unserializable", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    logEvent("test.circular", circular);
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.event).toBe("test.circular");
    expect(parsed.self).toBeUndefined();
  });
});
