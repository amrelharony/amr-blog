// Admin-only tag suggestions: the model picks up to 5 tags from the curated
// TAG_VOCABULARY (lib/ai/tags.ts); off-list output is dropped. The result only
// fills the editor's tags field for human review — nothing is saved here.
// Auth mirrors /api/admin/summarize.
import { NextRequest } from "next/server";
import { isAdminUser } from "@/lib/auth/require-admin";
import { OpenClawError, openclawConfigured } from "@/lib/ai/openclaw";
import { suggestTags } from "@/lib/ai/tags";

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
  if (!openclawConfigured()) return json({ error: "AI service not configured" }, 503);

  let body: { title?: string; excerpt?: string; content?: string; tags?: string[] };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const title = (body.title || "").trim();
  const content = (body.content || "").trim();
  if (!title && content.length < 50) {
    return json({ error: "Write a title or some content first." }, 400);
  }

  try {
    const tags = await suggestTags({
      title,
      excerpt: body.excerpt || "",
      content,
      tags: Array.isArray(body.tags) ? body.tags : [],
    });
    return json({ tags }, 200);
  } catch (e) {
    if (e instanceof OpenClawError) {
      if (e.status > 0) {
        return json({ error: e.message, detail: e.detail }, e.status >= 500 ? 503 : 502);
      }
      return json({ error: e.message }, 503);
    }
    return json({ error: (e as Error).message || "Tag suggestion failed" }, 502);
  }
}
