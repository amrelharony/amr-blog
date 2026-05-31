// Same-origin proxy for the OpenClaw chat widget. The widget's direct call to
// chat.amrelharony.com is CORS-blocked from the blog origin (its allowlist only has
// amrelharony.com). The widget is pointed here (AmrChatConfig.apiUrl="/api/openclaw");
// this forwards server-to-server (no browser CORS) with the API key + streams SSE back.
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPENCLAW_URL = process.env.OPENCLAW_URL || "https://chat.amrelharony.com/v1/chat/completions";
const OPENCLAW_KEY = process.env.OPENCLAW_API_KEY || "";

export async function POST(req: NextRequest) {
  // Same-origin guard — this is a keyed proxy; don't let other sites abuse it.
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) return new Response("Forbidden", { status: 403 });
    } catch {}
  }
  if (!OPENCLAW_KEY) return new Response(JSON.stringify({ error: "Chat not configured" }), { status: 503 });

  const body = await req.text();
  let upstream: Response;
  try {
    upstream = await fetch(OPENCLAW_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENCLAW_KEY}`, "Content-Type": "application/json" },
      body,
    });
  } catch {
    return new Response(JSON.stringify({ error: "AI server unreachable" }), { status: 502 });
  }

  // Pass the (streamed) response straight through.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "text/event-stream",
      "Cache-Control": "no-cache, no-store",
    },
  });
}
