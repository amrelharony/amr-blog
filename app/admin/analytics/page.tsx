import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface ArtStat {
  id: string;
  title: string;
  slug: string;
  views: number;
  reactions: Record<string, number> | null;
  published: boolean;
}

function rxSum(r: Record<string, number> | null): number {
  return Object.values(r || {}).reduce((s, n) => s + (n || 0), 0);
}

export default async function AdminAnalytics() {
  const sb = await createClient();
  const { data } = await sb
    .from("longform_articles")
    .select("id,title,slug,views,reactions,published")
    .order("views", { ascending: false })
    .limit(20);
  const arts = (data || []) as ArtStat[];

  const totalViews = arts.reduce((s, a) => s + (a.views || 0), 0);
  const totalRx = arts.reduce((s, a) => s + rxSum(a.reactions), 0);
  const maxViews = Math.max(1, ...arts.map((a) => a.views || 0));

  return (
    <div>
      <div className="adm-h">Analytics</div>
      <div className="adm-sub">Article performance. (Visitor globe coming soon.)</div>

      <div className="adm-grid" style={{ marginBottom: 20 }}>
        <div className="adm-stat">
          <div className="adm-stat-num">{totalViews.toLocaleString()}</div>
          <div className="adm-stat-label">Total article views</div>
        </div>
        <div className="adm-stat">
          <div className="adm-stat-num">{totalRx.toLocaleString()}</div>
          <div className="adm-stat-label">Total reactions</div>
        </div>
        <div className="adm-stat">
          <div className="adm-stat-num">{arts.filter((a) => a.published).length}</div>
          <div className="adm-stat-label">Published</div>
        </div>
      </div>

      <div className="adm-card">
        <div className="adm-label">Top articles by views</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
          {arts.map((a) => (
            <div key={a.id}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 12 }}>
                  {a.title} {!a.published && <em style={{ color: "var(--sub)" }}>(draft)</em>}
                </span>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", color: "var(--sub)" }}>
                  👁 {a.views || 0} · ❤ {rxSum(a.reactions)}
                </span>
              </div>
              <div style={{ height: 6, background: "rgba(255,255,255,.06)", borderRadius: 3, overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${Math.round(((a.views || 0) / maxViews) * 100)}%`,
                    background: "var(--accent)",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
