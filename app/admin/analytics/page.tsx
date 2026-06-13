import { createClient } from "@/lib/supabase/server";
import { bucketByPeriod, cumulative, sumReactions, tagDistribution, sparklinePoints } from "@/lib/analytics-agg";

export const dynamic = "force-dynamic";

interface Art {
  title: string;
  slug: string;
  views: number | null;
  reactions: Record<string, number> | null;
  published: boolean;
  tags: string[] | null;
  created_at: string;
}

function rxSum(r: Record<string, number> | null): number {
  return Object.values(r || {}).reduce((s, n) => s + (n || 0), 0);
}

const RX_LABEL: Record<string, string> = {
  heart: "❤️ Love",
  fire: "🔥 Fire",
  bulb: "💡 Insightful",
  clap: "👏 Bravo",
  target: "🎯 On point",
};

function BarList({ items, max }: { items: Array<{ label: string; value: number; note?: string }>; max: number }) {
  if (!items.length) return <div className="adm-sub">No data yet.</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
      {items.map((it) => (
        <div key={it.label}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 12 }}>
              {it.label}
            </span>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", color: "var(--sub)" }}>{it.note ?? it.value}</span>
          </div>
          <div style={{ height: 6, background: "rgba(255,255,255,.06)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.round((it.value / max) * 100)}%`, background: "var(--accent)" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function AdminAnalytics() {
  const sb = await createClient();
  const [{ data: artData }, { data: subData }, { data: cmtData }] = await Promise.all([
    sb.from("longform_articles").select("title,slug,views,reactions,published,tags,created_at"),
    sb.from("newsletter_subscribers").select("created_at,confirmed,unsubscribed_at"),
    sb.from("article_comments").select("created_at"),
  ]);
  const arts = (artData || []) as Art[];
  const subs = (subData || []) as Array<{ created_at: string; confirmed: boolean; unsubscribed_at: string | null }>;
  const comments = (cmtData || []) as Array<{ created_at: string }>;

  const totalViews = arts.reduce((s, a) => s + (a.views || 0), 0);
  const totalRx = arts.reduce((s, a) => s + rxSum(a.reactions), 0);
  const publishedCount = arts.filter((a) => a.published).length;
  const confirmedSubs = subs.filter((s) => s.confirmed && !s.unsubscribed_at).length;

  const top = [...arts].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 12);
  const maxViews = Math.max(1, ...top.map((a) => a.views || 0));

  const subGrowth = cumulative(bucketByPeriod(subs.map((s) => s.created_at), "month"));
  const growthVals = subGrowth.map((b) => b.total);
  const pubCadence = bucketByPeriod(arts.map((a) => a.created_at), "month").slice(-12);
  const commentsWeekly = bucketByPeriod(comments.map((c) => c.created_at), "week").slice(-16);
  const reactions = sumReactions(arts);
  const tags = tagDistribution(arts);

  return (
    <div>
      <div className="adm-h">Analytics</div>
      <div className="adm-sub">
        Derived from content timestamps. Views are running totals (no per-day history is recorded).
      </div>

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
          <div className="adm-stat-num">{publishedCount}</div>
          <div className="adm-stat-label">Published</div>
        </div>
        <div className="adm-stat">
          <div className="adm-stat-num">{confirmedSubs.toLocaleString()}</div>
          <div className="adm-stat-label">Confirmed subscribers</div>
        </div>
        <div className="adm-stat">
          <div className="adm-stat-num">{comments.length.toLocaleString()}</div>
          <div className="adm-stat-label">Comments</div>
        </div>
      </div>

      <div className="adm-card">
        <div className="adm-label">Subscriber growth (cumulative, by month)</div>
        {subGrowth.length >= 2 ? (
          <>
            <svg viewBox="0 0 600 80" preserveAspectRatio="none" style={{ width: "100%", height: 80, marginTop: 12 }}>
              <polyline
                points={sparklinePoints(growthVals, 600, 80, 4)}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--sub)", fontFamily: "'JetBrains Mono',monospace" }}>
              <span>{subGrowth[0].label}</span>
              <span>{subGrowth[subGrowth.length - 1].label} · {growthVals[growthVals.length - 1]} total</span>
            </div>
          </>
        ) : (
          <div className="adm-sub" style={{ marginTop: 10 }}>Not enough data yet.</div>
        )}
      </div>

      <div className="adm-card">
        <div className="adm-label">Publishing cadence (articles per month)</div>
        <BarList items={pubCadence.map((b) => ({ label: b.label, value: b.count }))} max={Math.max(1, ...pubCadence.map((b) => b.count))} />
      </div>

      <div className="adm-card">
        <div className="adm-label">Comments per week</div>
        <BarList items={commentsWeekly.map((b) => ({ label: b.label, value: b.count }))} max={Math.max(1, ...commentsWeekly.map((b) => b.count))} />
      </div>

      <div className="adm-card">
        <div className="adm-label">Reactions by type</div>
        <BarList items={reactions.map((r) => ({ label: RX_LABEL[r.key] || r.key, value: r.count }))} max={Math.max(1, ...reactions.map((r) => r.count))} />
      </div>

      <div className="adm-card">
        <div className="adm-label">Top tags</div>
        <BarList
          items={tags.map((t) => ({ label: t.tag, value: t.count, note: `${t.count} · 👁 ${t.views}` }))}
          max={Math.max(1, ...tags.map((t) => t.count))}
        />
      </div>

      <div className="adm-card">
        <div className="adm-label">Top articles by views</div>
        <BarList
          items={top.map((a) => ({
            label: a.published ? a.title : `${a.title} (draft)`,
            value: a.views || 0,
            note: `👁 ${a.views || 0} · ❤ ${rxSum(a.reactions)}`,
          }))}
          max={maxViews}
        />
      </div>
    </div>
  );
}
