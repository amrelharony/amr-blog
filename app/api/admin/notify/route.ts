// Admin-triggered instant notification for a just-published article — fired
// fire-and-forget from the editor's publish path. Safe to double-click or
// re-publish: runArticleNotify's DB claim (unique article_id) makes repeat
// calls no-ops. Auth mirrors /api/admin/summarize.
import { NextRequest } from "next/server";
import { after } from "next/server";
import { isAdminUser } from "@/lib/auth/require-admin";
import { runArticleNotify } from "@/lib/newsletter/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!(await isAdminUser())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  let id = "";
  try {
    const body = await req.json();
    id = typeof body?.id === "string" ? body.id : "";
  } catch {
    /* fall through */
  }
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  after(() => runArticleNotify(id));
  return Response.json({ ok: true }, { status: 202 });
}
