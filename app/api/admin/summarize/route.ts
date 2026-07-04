// Admin-only one-shot TL;DR generation. Non-streaming: the admin triggers it
// once in the editor, reviews/edits the result, and saves it into the article's
// `tldr` column — so it's generated at write time, never per request. Auth
// mirrors /api/revalidate: a valid admin session (auth.uid() === ADMIN_UUID).
//
// The prompt, provider plumbing, and output cleanup live in lib/ai/ (shared
// with the batch backfill in scripts/backfill-tldr.mjs and the auto-tagger).
import { NextRequest } from "next/server";
import { isAdminUser } from "@/lib/auth/require-admin";
import { OpenClawError, openclawConfigured } from "@/lib/ai/openclaw";
import { generateTldr } from "@/lib/ai/summarize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(req: NextRequest) {
  if (!(await isAdminUser())) return json({ error: "Unauthorized" }, 401);
  if (!openclawConfigured()) return json({ error: "Summary service not configured" }, 503);

  let body: { title?: string; content?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const title = (body.title || "").trim().slice(0, 200);
  const content = (body.content || "").trim();
  if (content.length < 50) return json({ error: "Article content is too short to summarize." }, 400);

  try {
    const tldr = await generateTldr(title, content);
    return json({ tldr }, 200);
  } catch (e) {
    if (e instanceof OpenClawError) {
      // Admin-only route, so surface a trimmed upstream reason to aid diagnosis.
      if (e.status > 0) {
        return json({ error: e.message, detail: e.detail }, e.status >= 500 ? 503 : 502);
      }
      return json({ error: e.message }, 503);
    }
    return json({ error: (e as Error).message || "Summary failed" }, 502);
  }
}
