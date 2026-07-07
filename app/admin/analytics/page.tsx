import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getTrendingArticles } from "@/lib/queries/trending";
import {
  aggregateCategories,
  aggregateTags,
  fetchAllArticleFacts,
  fetchViewSeries,
  type ArticleFact,
  type DayPoint,
} from "@/lib/queries/admin-analytics";

export const dynamic = "force-dynamic";

interface ArtStat {
  title: string;
  slug: string;
  views: number;
  reactions: Record<string, number> | null;
  published: boolean;
}

function rxSum(r: Record<string, number> | null): number {
  return Object.values(r || {}).reduce((s, n) => s + (n || 0), 0);
}

const n = (v: unknown): number => Number(v ?? 0) || 0;

function fmtDuration(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

/** Horizontal sparkbar shared by the leaderboard-style cards. */
function Bar({ value, max }: { value: number; max: number }) {
  return (
    <div style={{ height: 6, background: "rgba(255,255,255,.06)", borderRadius: 3, overflow: "hidden" }}>
      <div
        style={{
          height: "100%",
          width: `${Math.round((value / Math.max(1, max)) * 100)}%`,
          background: "var(--accent)",
        }}
      />
    </div>
  );
}

// The view-per-day widget needs the SERVICE-ROLE client (article_view_daily has
// no RLS policies) and must never take the page down with it: no key, no chart.
async function safeViewSeries(days: number): Promise<DayPoint[] | null> {
  try {
    return await fetchViewSeries(createServiceClient(), days);
  } catch {
    return null;
  }
}

export default async function AdminAnalytics() {
  await requireAdmin(); // backstop behind proxy.ts — don't render on RLS alone
  const sb = await createClient();

  // Top-20 stays a leaderboard; the headline TOTALS now come from a real SUM RPC
  // (the page previously summed only these 20 rows, badly undercounting ~3000).
  const [topRes, totalsRes, engRes, growthRes, facts, trending, viewSeries] = await Promise.all([
    sb
      .from("longform_articles")
      .select("title,slug,views,reactions,published")
      .order("views", { ascending: false })
      .limit(20),
    sb.rpc("get_content_totals"),
    sb.rpc("get_reading_engagement"),
    sb.rpc("get_subscriber_growth", { p_weeks: 12 }),
    fetchAllArticleFacts(sb).catch(() => null as ArticleFact[] | null),
    getTrendingArticles(7, 10),
    safeViewSeries(30),
  ]);

  const arts = (topRes.data || []) as ArtStat[];
  const t = (totalsRes.data?.[0] || {}) as Record<string, unknown>;
  const e = (engRes.data?.[0] || {}) as Record<string, unknown>;
  const growth = (growthRes.data || []) as {
    week_start: string;
    new_count: number;
    unsub_count: number;
  }[];

  const categories = facts ? aggregateCategories(facts) : null;
  const tags = facts ? aggregateTags(facts, 15) : null;

  const maxViews = Math.max(1, ...arts.map((a) => a.views || 0));
  const maxNew = Math.max(1, ...growth.map((g) => n(g.new_count)));
  const maxTrend = Math.max(1, ...trending.map((a) => n(a.recent_views)));
  const maxCatViews = Math.max(1, ...(categories || []).map((c) => c.totalViews));
  const maxTagCount = Math.max(1, ...(tags || []).map((tg) => tg.count));
  const maxDay = Math.max(1, ...(viewSeries || []).map((d) => d.views));

  const cards = [
    { num: n(t.total_views).toLocaleString(), label: "Total article views" },
    { num: n(t.total_reactions).toLocaleString(), label: "Total reactions" },
    { num: n(t.published_count).toLocaleString(), label: "Published" },
    { num: n(t.draft_count).toLocaleString(), label: "Drafts" },
  ];

  const factsError = (
    <div className="adm-sub" style={{ marginTop: 12 }}>
      Couldn&apos;t load the article library — reload to retry.
    </div>
  );

  return (
    <div>
      <div className="adm-h">Analytics</div>
      <div className="adm-sub">Article performance across all {n(t.total_count).toLocaleString()} articles.</div>

      <div className="adm-grid" style={{ marginBottom: 20 }}>
        {cards.map((c) => (
          <div key={c.label} className="adm-stat">
            <div className="adm-stat-num">{c.num}</div>
            <div className="adm-stat-label">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="adm-card">
        <div className="adm-label">Reading engagement</div>
        <div className="adm-grid" style={{ marginTop: 12 }}>
          <div className="adm-stat">
            <div className="adm-stat-num">{n(e.reads).toLocaleString()}</div>
            <div className="adm-stat-label">Tracked reads</div>
          </div>
          <div className="adm-stat">
            <div className="adm-stat-num">{n(e.readers).toLocaleString()}</div>
            <div className="adm-stat-label">Unique readers</div>
          </div>
          <div className="adm-stat">
            <div className="adm-stat-num">{Math.round(n(e.avg_progress))}%</div>
            <div className="adm-stat-label">Avg. completion</div>
          </div>
          <div className="adm-stat">
            <div className="adm-stat-num">{n(e.completed_count).toLocaleString()}</div>
            <div className="adm-stat-label">Completed reads</div>
          </div>
          <div className="adm-stat">
            <div className="adm-stat-num">{fmtDuration(n(e.avg_time_spent))}</div>
            <div className="adm-stat-label">Avg. time on page</div>
          </div>
        </div>
      </div>

      <div className="adm-card">
        <div className="adm-label">Trending now (last 7 days)</div>
        <div className="adm-sub" style={{ marginBottom: 0 }}>
          Published articles by recent views — the same ranking the homepage shows.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
          {trending.length === 0 && <div className="adm-sub">No recent view data yet.</div>}
          {trending.map((a) => (
            <div key={a.slug}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 12 }}>
                  <a href={`/p/${a.slug}`} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>
                    {a.title}
                  </a>
                </span>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", color: "var(--sub)", whiteSpace: "nowrap" }}>
                  🔥 {n(a.recent_views).toLocaleString()} · 👁 {n(a.views).toLocaleString()}
                </span>
              </div>
              <Bar value={n(a.recent_views)} max={maxTrend} />
            </div>
          ))}
        </div>
      </div>

      <div className="adm-card">
        <div className="adm-label">Category breakdown</div>
        {!categories && factsError}
        {categories && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
            {categories.map((c) => (
              <div key={c.label}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, marginBottom: 4, gap: 8 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.label}</span>
                    <span className="adm-pill">{c.articles.toLocaleString()} articles</span>
                    <span className="adm-pill live">{c.published.toLocaleString()} live</span>
                  </span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", color: "var(--sub)", whiteSpace: "nowrap" }}>
                    👁 {c.totalViews.toLocaleString()} · {c.avgViews.toLocaleString()}/article
                  </span>
                </div>
                <Bar value={c.totalViews} max={maxCatViews} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="adm-card">
        <div className="adm-label">Top tags</div>
        {!tags && factsError}
        {tags && tags.length === 0 && <div className="adm-sub" style={{ marginTop: 12 }}>No tags yet.</div>}
        {tags && tags.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
            {tags.map((tg) => (
              <div key={tg.tag}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, marginBottom: 4, gap: 8 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <span className="adm-pill">{tg.tag}</span>
                    <span style={{ color: "var(--sub)", fontSize: 12 }}>{tg.count.toLocaleString()} articles</span>
                  </span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", color: "var(--sub)", whiteSpace: "nowrap" }}>
                    👁 {tg.views.toLocaleString()}
                  </span>
                </div>
                <Bar value={tg.count} max={maxTagCount} />
              </div>
            ))}
          </div>
        )}
      </div>

      {viewSeries && (
        <div className="adm-card">
          <div className="adm-label">Views per day (last 30 days, UTC)</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 90, marginTop: 14 }}>
            {viewSeries.map((d, i) => (
              <div key={d.day} style={{ flex: 1, textAlign: "center" }} title={`${d.day} · ${d.views.toLocaleString()} views`}>
                <div
                  style={{
                    height: `${Math.round((d.views / maxDay) * 70)}px`,
                    background: "var(--accent)",
                    borderRadius: "3px 3px 0 0",
                    minHeight: 2,
                  }}
                />
                <div style={{ fontSize: 8, color: "var(--sub)", marginTop: 4, fontFamily: "'JetBrains Mono',monospace" }}>
                  {i % 5 === 0 ? d.day.slice(5) : " "}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="adm-card">
        <div className="adm-label">Subscriber growth (last 12 weeks)</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 90, marginTop: 14 }}>
          {growth.map((g) => (
            <div key={g.week_start} style={{ flex: 1, textAlign: "center" }} title={`${g.week_start.slice(0, 10)} · +${n(g.new_count)} / -${n(g.unsub_count)}`}>
              <div
                style={{
                  height: `${Math.round((n(g.new_count) / maxNew) * 70)}px`,
                  background: "var(--accent)",
                  borderRadius: "3px 3px 0 0",
                  minHeight: 2,
                }}
              />
              <div style={{ fontSize: 8, color: "var(--sub)", marginTop: 4, fontFamily: "'JetBrains Mono',monospace" }}>
                {g.week_start.slice(5, 10)}
              </div>
            </div>
          ))}
          {growth.length === 0 && <div className="adm-sub">No subscriber data yet.</div>}
        </div>
      </div>

      <div className="adm-card">
        <div className="adm-label">Top articles by views</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
          {arts.map((a) => (
            <div key={a.slug}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 12 }}>
                  {a.title} {!a.published && <em style={{ color: "var(--sub)" }}>(draft)</em>}
                </span>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", color: "var(--sub)", whiteSpace: "nowrap" }}>
                  👁 {a.views || 0} · ❤ {rxSum(a.reactions)}
                </span>
              </div>
              <Bar value={a.views || 0} max={maxViews} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
