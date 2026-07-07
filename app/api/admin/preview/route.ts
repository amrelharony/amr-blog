// Admin-only live preview: renders editor markdown through the SAME pipeline as
// the public article page (renderArticleHtml is server-only — isomorphic-dompurify
// / jsdom — so it can't run in the browser). Auth mirrors /api/admin/summarize.
import { NextRequest } from "next/server";
import { isAdminUser } from "@/lib/auth/require-admin";
import { renderArticleHtml } from "@/lib/markdown/parse";
import { logEvent } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

export async function POST(req: NextRequest) {
  if (!(await isAdminUser())) return json({ error: "Unauthorized" }, 401);
  let body: { content?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  try {
    return json({ html: renderArticleHtml(body.content || "") }, 200);
  } catch (e) {
    // The render pipeline (isomorphic-dompurify/jsdom) failing is exactly the
    // kind of silent 500 worth surfacing — it means the editor preview is down.
    logEvent("admin.preview.failed", { message: e instanceof Error ? e.message : String(e) });
    return json({ error: "Preview render failed" }, 500);
  }
}
