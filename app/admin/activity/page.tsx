import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

interface Entry {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  summary: string | null;
  created_at: string;
}

const actionPill = (a: string) =>
  a === "publish" ? "live" : a === "delete" || a === "spam" ? "draft" : "sched";

export default async function AdminActivity() {
  await requireAdmin(); // backstop behind proxy.ts — don't render on RLS alone
  const sb = await createClient();
  const { data } = await sb
    .from("activity_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  const entries = (data || []) as Entry[];

  return (
    <div>
      <div className="adm-h">Activity</div>
      <div className="adm-sub">Recent admin actions — newest first (last {entries.length}).</div>
      <div className="adm-list">
        {entries.length === 0 && <div className="adm-sub">No activity recorded yet.</div>}
        {entries.map((e) => (
          <div key={e.id} className="adm-list-item" style={{ cursor: "default" }}>
            <span className={"adm-pill " + actionPill(e.action)}>{e.action}</span>
            {e.entity_type && <span className="adm-pill">{e.entity_type}</span>}
            <span className="adm-list-title" style={{ fontWeight: 400, fontSize: 13 }}>
              {e.summary || e.entity_id || "—"}
            </span>
            <span className="adm-pill">{fmtDate(e.created_at)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
