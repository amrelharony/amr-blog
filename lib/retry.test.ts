import { describe, it, expect, vi } from "vitest";
import { withRetry } from "@/lib/retry";

describe("withRetry", () => {
  it("returns the first success without retrying", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(withRetry(fn, { delaysMs: [0, 0] })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries failures up to `attempts` then rethrows the last error", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("boom-3"));
    await expect(withRetry(fn, { attempts: 3, delaysMs: [0, 0] })).rejects.toThrow("boom-3");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("succeeds on a later attempt and reports that value", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("1"))
      .mockResolvedValueOnce("recovered");
    await expect(withRetry(fn, { attempts: 3, delaysMs: [0, 0] })).resolves.toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("rethrows immediately when attempts is 1 (no retry)", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("once"));
    await expect(withRetry(fn, { attempts: 1 })).rejects.toThrow("once");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("honors the configured delays between attempts", async () => {
    vi.useFakeTimers();
    try {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error("a"))
        .mockResolvedValueOnce("done");
      const p = withRetry(fn, { attempts: 2, delaysMs: [500] });
      // Before the delay elapses, the second attempt hasn't run.
      await vi.advanceTimersByTimeAsync(499);
      expect(fn).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await expect(p).resolves.toBe("done");
      expect(fn).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
