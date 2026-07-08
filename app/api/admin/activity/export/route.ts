// Admin-only CSV export of the (filtered) activity log. Auth mirrors
// /api/admin/summarize: a valid admin session (auth.uid() === ADMIN_UUID).
// Uses the SESSION client — activity_log RLS already admits the admin (0006) —
// so no service role is involved. Filters are parsed by the same
// lib/queries/activity helpers the /admin/activity page uses, so the download
// always matches the on-screen list.
import { NextRequest } from "next/server";
import { isAdminUser } from "@/lib/auth/require-admin";
import { createClient } from "@/lib/supabase/server";
import { csvCell } from "@/lib/csv";
import { fetchAllActivityRows, parseActivityFilters } from "@/lib/queries/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await isAdminUser())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const f = parseActivityFilters(Object.fromEntries(req.nextUrl.searchParams.entries()));
  const sb = await createClient();

  let rows;
  try {
    rows = await fetchAllActivityRows(sb, f);
  } catch (e) {
    console.error("[admin/activity/export]", e);
    return Response.json({ error: "Export failed" }, { status: 500 });
  }

  const header = ["action", "entity_type", "entity_id", "summary", "created_at"].join(",");
  const lines = rows.map((r) =>
    [r.action, r.entity_type || "", r.entity_id || "", r.summary || "", r.created_at]
      .map(csvCell)
      .join(","),
  );

  return new Response([header, ...lines].join("\r\n"), {
    headers: {
      "Content-Type": "text/csv;charset=utf-8",
      "Content-Disposition": 'attachment; filename="activity.csv"',
    },
  });
}
