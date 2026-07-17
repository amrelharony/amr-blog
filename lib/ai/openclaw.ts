// Non-streaming OpenClaw (OpenAI-compatible) completion helper — extracted from
// app/api/admin/summarize/route.ts so summaries, auto-tagging, and future
// enrichment share one client. Env mirrors the summarize route exactly, so no
// new configuration is required.
const API_URL =
  process.env.SUMMARY_API_URL ||
  process.env.OPENCLAW_URL ||
  "https://chat.amrelharony.com/v1/chat/completions";
const API_KEY = process.env.SUMMARY_API_KEY || process.env.OPENCLAW_API_KEY || "";
const MODEL = process.env.SUMMARY_MODEL || process.env.OPENCLAW_MODEL || "openclaw";

const DEFAULT_TIMEOUT_MS = 30_000;

export class OpenClawError extends Error {
  constructor(
    message: string,
    /** Upstream HTTP status when the request reached the server, else 0. */
    public readonly status: number = 0,
    /** Trimmed upstream body (admin-only surfaces may show it). */
    public readonly detail: string = "",
  ) {
    super(message);
  }
}

export function openclawConfigured(): boolean {
  return Boolean(API_KEY);
}

/** One-shot completion. Throws OpenClawError on any failure or empty output. */
export async function openclawComplete(opts: {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}): Promise<string> {
  if (!API_KEY) throw new OpenClawError("AI service not configured");

  const controller = new AbortController();
  // Keep the timeout armed through the body reads below, not just the headers: a stalled
  // upstream body (slow-loris) would otherwise hang summarize/suggest-tags/auto-tag forever.
  // Clearing it in a fetch-only finally (as an earlier version did) left .text()/.json()
  // unbounded — the streaming client in lib/embeddings.ts keeps its timer armed for exactly
  // this reason.
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    let upstream: Response;
    try {
      upstream = await fetch(API_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: opts.system },
            { role: "user", content: opts.user },
          ],
          stream: false,
          max_tokens: opts.maxTokens ?? 220,
          temperature: opts.temperature ?? 0.4,
        }),
        signal: controller.signal,
      });
    } catch {
      throw new OpenClawError("AI server unreachable");
    }

    if (!upstream.ok) {
      let detail = "";
      try {
        detail = (await upstream.text()).slice(0, 200);
      } catch {}
      throw new OpenClawError(`AI request failed (${upstream.status})`, upstream.status, detail);
    }

    let content = "";
    try {
      const data = await upstream.json();
      content = (data?.choices?.[0]?.message?.content || "").toString();
    } catch {
      throw new OpenClawError("Could not parse AI response");
    }
    if (!content.trim()) throw new OpenClawError("AI returned an empty response");
    return content;
  } finally {
    clearTimeout(timeout);
  }
}
