// Admin-triggered (re-)embedding of one article — fired fire-and-forget by the
// editor after save so related-articles ranking stays fresh. Auth mirrors
// /api/admin/summarize: a valid admin session. The work itself is fail-open;
// this endpoint only reports whether it was accepted.
import { NextRequest } from "next/server";
import { after } from "next/server";
import { isAdminUser } from "@/lib/auth/require-admin";
import { generateArticleEmbeddingFailOpen } from "@/lib/embeddings";

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
    /* fall through to the check below */
  }
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  // The helper is fail-open; the catch is a backstop so a regression to
  // throwing can never surface as an unhandled rejection in the after() task.
  after(async () => {
    try {
      await generateArticleEmbeddingFailOpen(id);
    } catch (e) {
      console.error("[after:admin/embed]", id, e);
    }
  });
  return Response.json({ ok: true }, { status: 202 });
}
