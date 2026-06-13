// Admin-only one-shot TL;DR generation via OpenClaw (the same OpenAI-compatible
// endpoint as the chat route). Non-streaming: the admin triggers it once in the
// editor, reviews/edits the result, and saves it into the article's `tldr`
// column — so it's generated at write time, never per request. Auth mirrors
// /api/revalidate: a valid admin session (auth.uid() === ADMIN_UUID).
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_UUID } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPENCLAW_URL = process.env.OPENCLAW_URL || "https://chat.amrelharony.com/v1/chat/completions";
const OPENCLAW_KEY = process.env.OPENCLAW_API_KEY || "";
const OPENCLAW_MODEL = process.env.OPENCLAW_MODEL || "openclaw";

const MAX_CONTENT = 6000; // chars of article body sent upstream (keeps input in budget)
const REQUEST_TIMEOUT = 30000;

const SYSTEM_PROMPT =
  "You write a TL;DR for a blog article by Amr Elharony. Summarize the article below in 2-3 sentences (under 60 words). Speak as Amr in the first person, plainly and concretely. Capture the core thesis and takeaway only — do NOT invent facts, numbers, or links not present in the text. Return plain prose with no preamble, no markdown, no quotes.";

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function isAdmin(): Promise<boolean> {
  try {
    const sb = await createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    return user?.id === ADMIN_UUID;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return json({ error: "Unauthorized" }, 401);
  if (!OPENCLAW_KEY) return json({ error: "Summary service not configured" }, 503);

  let body: { title?: string; content?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const title = (body.title || "").trim().slice(0, 200);
  const content = (body.content || "").trim();
  if (content.length < 50) return json({ error: "Article content is too short to summarize." }, 400);

  const userContent = `${title ? `Title: ${title}\n\n` : ""}Article:\n${content.slice(0, MAX_CONTENT)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  let upstream: Response;
  try {
    upstream = await fetch(OPENCLAW_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENCLAW_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OPENCLAW_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        stream: false,
        max_tokens: 220,
        temperature: 0.4,
      }),
      signal: controller.signal,
    });
  } catch {
    return json({ error: "AI server unreachable" }, 503);
  } finally {
    clearTimeout(timeout);
  }

  if (!upstream.ok) return json({ error: "AI request failed" }, upstream.status >= 500 ? 503 : 502);

  let tldr = "";
  try {
    const data = await upstream.json();
    tldr = (data?.choices?.[0]?.message?.content || "").toString();
  } catch {
    return json({ error: "Could not parse AI response" }, 502);
  }
  // Strip any stray markup/control chars and surrounding quotes the model might add.
  tldr = tldr
    .replace(/<[^>]*>/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .trim()
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .trim();

  if (!tldr) return json({ error: "AI returned an empty summary." }, 502);
  return json({ tldr }, 200);
}
