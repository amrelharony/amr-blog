// AI chatbot — ported from api/chat.js. Streams an OpenClaw (OpenAI-compatible) SSE
// completion. Differs from the original in two ways, per the standalone-blog plan:
//   • Auth is cookie-based (the visitor's anonymous @supabase/ssr session) instead of a
//     bearer header — RPCs run as the user so auth.uid() resolves for rate-limiting.
//   • KB matching is SERVER-SIDE (lib/kb), so the 2.12 MB knowledge base never ships to
//     the client; the matched context is injected here.
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { matchQuery, buildContext, matchedCats } from "@/lib/kb/match";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPENCLAW_URL = process.env.OPENCLAW_URL || "https://chat.amrelharony.com/v1/chat/completions";
const OPENCLAW_KEY = process.env.OPENCLAW_API_KEY || "";
const OPENCLAW_MODEL = process.env.OPENCLAW_MODEL || "zai glm-5.1";

const MAX_MSG_LEN = 500;
const MAX_HISTORY = 10;
const MAX_TOKENS = 2000;
const REQUEST_TIMEOUT = 30000;
const STREAM_IDLE_TIMEOUT = 30000;

const SYSTEM_PROMPT =
  "You are Amr Elharony's AI assistant on his writing blog. Answer ONLY from the context provided by the user. Be concise (2-3 sentences). Speak as Amr in first person. NEVER invent links, prices, or details not in the context. If you don't know, say so honestly.";

function sanitize(str: unknown): string {
  if (typeof str !== "string") return "";
  // eslint-disable-next-line no-control-regex
  return str.replace(/<[^>]*>/g, "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "").trim();
}

type Msg = { role: "user" | "assistant"; content: string };
function validateHistory(history: unknown): Msg[] {
  if (!Array.isArray(history)) return [];
  return history
    .filter(
      (m): m is Msg =>
        m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
    )
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role, content: sanitize(m.content).slice(0, MAX_MSG_LEN * 2) }));
}

interface RateLimits {
  allowed: boolean;
  daily_used?: number;
  daily_max?: number;
  weekly_used?: number;
  weekly_max?: number;
  monthly_used?: number;
  monthly_max?: number;
}
function rateLimitHeaders(l: RateLimits): Record<string, string> {
  return {
    "X-RateLimit-Daily": String(l.daily_used || 0),
    "X-RateLimit-Daily-Max": String(l.daily_max || 25),
    "X-RateLimit-Weekly": String(l.weekly_used || 0),
    "X-RateLimit-Weekly-Max": String(l.weekly_max || 100),
    "X-RateLimit-Monthly": String(l.monthly_used || 0),
    "X-RateLimit-Monthly-Max": String(l.monthly_max || 300),
  };
}

function json(data: unknown, status: number, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extra },
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  let body: { message?: string; history?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const message = sanitize(body.message || "");
  if (!message || message.length > MAX_MSG_LEN) {
    return json({ error: `Message required (max ${MAX_MSG_LEN} chars)` }, 400);
  }
  const history = validateHistory(body.history);

  // Rate limit. The live Connect RPCs take the (server-verified) user id explicitly:
  //   check_chat_rate_limit(p_user_id) · record_chat_usage(p_user_id, p_tokens, p_model)
  const { data: rl, error: rlErr } = await supabase.rpc("check_chat_rate_limit", {
    p_user_id: user.id,
  });
  const limits: RateLimits = (Array.isArray(rl) ? rl[0] : rl) || {
    allowed: !rlErr,
    daily_used: 0,
    daily_max: 25,
    weekly_used: 0,
    weekly_max: 100,
    monthly_used: 0,
    monthly_max: 300,
  };
  if (!limits.allowed) {
    return json(
      { error: "Rate limit exceeded" },
      429,
      { "Retry-After": "3600", ...rateLimitHeaders(limits) },
    );
  }

  // Server-side KB → context + categories (for follow-up chips on the client)
  const kb = matchQuery(message);
  const context = buildContext(kb);
  const cats = matchedCats(kb);

  if (!OPENCLAW_KEY) {
    return json({ error: "Chat service not configured", fallback: true }, 503, rateLimitHeaders(limits));
  }

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history,
    { role: "user", content: context ? `Context:\n${context}\n\nQuestion: ${message}` : message },
  ];

  const controller = new AbortController();
  const headerTimeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  let upstream: Response;
  try {
    upstream = await fetch(OPENCLAW_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENCLAW_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OPENCLAW_MODEL,
        messages,
        stream: true,
        max_tokens: MAX_TOKENS,
        temperature: 0.7,
        frequency_penalty: 0.5,
        presence_penalty: 0.3,
        stream_options: { include_usage: true },
      }),
      signal: controller.signal,
    });
  } catch {
    clearTimeout(headerTimeout);
    return json({ error: "AI server unreachable", fallback: true }, 503, rateLimitHeaders(limits));
  }
  clearTimeout(headerTimeout);

  if (!upstream.ok || !upstream.body) {
    const errStatus = upstream.status >= 500 ? 503 : 502;
    return json({ error: "AI request failed", fallback: true }, errStatus, rateLimitHeaders(limits));
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(ctrl) {
      const reader = upstream.body!.getReader();
      let buffer = "";
      let tokensTotal = 0;
      let idleTimer: ReturnType<typeof setTimeout> | null = null;
      const armIdle = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          try {
            reader.cancel("idle-timeout");
          } catch {}
        }, STREAM_IDLE_TIMEOUT);
      };
      armIdle();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          armIdle();
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;
            const data = trimmed.slice(6);
            if (data === "[DONE]") {
              ctrl.enqueue(encoder.encode("data: [DONE]\n\n"));
              continue;
            }
            try {
              const parsed = JSON.parse(data);
              if (parsed.usage && Number.isFinite(parsed.usage.total_tokens)) {
                tokensTotal = parsed.usage.total_tokens;
              } else {
                const content = parsed.choices?.[0]?.delta?.content;
                if (content && !tokensTotal) tokensTotal += Math.max(1, Math.ceil(content.length / 4));
              }
              ctrl.enqueue(encoder.encode(`data: ${data}\n\n`));
            } catch {
              // skip malformed chunk
            }
          }
        }
      } catch {
        // upstream stream error — close gracefully
      } finally {
        if (idleTimer) clearTimeout(idleTimer);
        ctrl.close();
        try {
          await supabase.rpc("record_chat_usage", {
            p_user_id: user.id,
            p_tokens: tokensTotal,
            p_model: OPENCLAW_MODEL,
          });
        } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-store",
      Connection: "keep-alive",
      "X-KB-Cats": cats.join(","),
      ...rateLimitHeaders(limits),
    },
  });
}
