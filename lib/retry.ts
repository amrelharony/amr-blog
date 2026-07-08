// Minimal retry-with-backoff for writes whose loss is worse than a little
// latency (e.g. the notification/bulletin status updates that run AFTER emails
// are already out — a lost write there wedges the run). Deliberately tiny: no
// jitter, no per-error policy. Rethrows the last error once attempts run out.
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts?: { attempts?: number; delaysMs?: number[] },
): Promise<T> {
  const attempts = Math.max(1, opts?.attempts ?? 3);
  const delaysMs = opts?.delaysMs ?? [300, 1200];
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) {
        const wait = delaysMs[i] ?? delaysMs[delaysMs.length - 1] ?? 0;
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  throw lastErr;
}
