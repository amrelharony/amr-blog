// Structured one-line JSON event logging for server code (rate-limit
// rejections, cron run summaries, RPC failures). Vercel captures stdout per
// invocation; a stable `event` key makes the lines grep/query-able there.
// Pure Node — no Supabase/Next imports — so it stays unit-testable (vitest
// covers lib/** only).
export function logEvent(event: string, fields?: Record<string, unknown>): void {
  const ts = new Date().toISOString();
  try {
    console.log(JSON.stringify({ ts, event, ...fields }));
  } catch {
    // Unserializable field (circular ref, BigInt) — keep the signal, drop the detail.
    console.log(JSON.stringify({ ts, event }));
  }
}
