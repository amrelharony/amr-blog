import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

interface Upcoming {
  kind: "Article" | "Thought";
  label: string;
  scheduled_at: string;
}

export default async function AdminDashboard() {
  await requireAdmin(); // backstop behind proxy.ts — don't render on RLS alone
  const sb = await createClient();
  const head = { count: "exact" as const, head: true };
  const [articles, published, scheduled, thoughts, subscribers, comments, schedArts, schedThoughts, bulletin] =
    await Promise.all([
      sb.from("longform_articles").select("id", head).then((r) => r.count || 0),
      sb.from("longform_articles").select("id", head).eq("published", true).then((r) => r.count || 0),
      sb
        .from("longform_articles")
        .select("id", head)
        .eq("published", false)
        .not("scheduled_at", "is", null)
        .then((r) => r.count || 0),
      sb.from("microblog").select("id", head).then((r) => r.count || 0),
      sb
        .from("newsletter_subscribers")
        .select("id", head)
        .eq("confirmed", true)
        .is("unsubscribed_at", null)
        .then((r) => r.count || 0),
      sb.from("article_comments").select("id", head).then((r) => r.count || 0),
      sb
        .from("longform_articles")
        .select("id,title,scheduled_at")
        .eq("published", false)
        .not("scheduled_at", "is", null)
        .order("scheduled_at", { ascending: true })
        .limit(10),
      sb
        .from("microblog")
        .select("id,content,scheduled_at")
        .eq("published", false)
        .not("scheduled_at", "is", null)
        .order("scheduled_at", { ascending: true })
        .limit(10),
      sb.rpc("get_recent_bulletins", { p_limit: 1 }),
    ]);

  // Drafts now EXCLUDE scheduled posts (which used to be lumped in as drafts).
  const stats = [
    { num: published, label: "Published articles" },
    { num: Math.max(0, articles - published - scheduled), label: "Drafts" },
    { num: scheduled, label: "Scheduled" },
    { num: thoughts, label: "Thoughts" },
    { num: subscribers, label: "Subscribers" },
    { num: comments, label: "Comments" },
  ];

  const upcoming: Upcoming[] = [
    ...((schedArts.data || []) as { title: string; scheduled_at: string }[]).map((a) => ({
      kind: "Article" as const,
      label: a.title,
      scheduled_at: a.scheduled_at,
    })),
    ...((schedThoughts.data || []) as { content: string; scheduled_at: string }[]).map((t) => ({
      kind: "Thought" as const,
      label: (t.content || "").slice(0, 60),
      scheduled_at: t.scheduled_at,
    })),
  ]
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
    .slice(0, 12);

  const lastBulletin = (bulletin.data?.[0] || null) as
    | { sent_at: string; status: string; recipient_count: number; article_count: number }
    | null;

  return (
    <div>
      <div className="adm-h">Dashboard</div>
      <div className="adm-sub">Overview of your content.</div>
      <div className="adm-grid">
        {stats.map((s) => (
          <div key={s.label} className="adm-stat">
            <div className="adm-stat-num">{s.num}</div>
            <div className="adm-stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="adm-card" style={{ marginTop: 20 }}>
        <div className="adm-label">Operations</div>
        <div style={{ fontSize: 12, color: "var(--sub)", marginTop: 8, marginBottom: 6 }}>
          Last newsletter:{" "}
          {lastBulletin
            ? `${lastBulletin.status} · ${fmtDate(lastBulletin.sent_at)} · ${lastBulletin.recipient_count} recipients`
            : "none sent yet"}
        </div>
        <div style={{ fontSize: 12, color: "var(--sub)", marginBottom: 6 }}>
          Upcoming scheduled ({upcoming.length}) — auto-published by the cron:
        </div>
        <div className="adm-list">
          {upcoming.length === 0 && <div className="adm-sub">Nothing scheduled.</div>}
          {upcoming.map((u, i) => (
            <div key={i} className="adm-list-item" style={{ cursor: "default" }}>
              <span className="adm-pill">{u.kind}</span>
              <span className="adm-list-title" style={{ fontWeight: 400, fontSize: 13 }}>
                {u.label || "(untitled)"}
              </span>
              <span className="adm-pill sched">{fmtDate(u.scheduled_at)}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: "var(--sub)", marginTop: 8 }}>
          To unschedule, open the post and click “Save draft”.
        </div>
      </div>

      <div className="adm-actions" style={{ marginTop: 20 }}>
        <Link className="adm-btn primary" href="/admin/write">
          ✍️ Write article
        </Link>
        <Link className="adm-btn" href="/admin/thoughts">
          💭 New thought
        </Link>
        <Link className="adm-btn" href="/admin/newsletter">
          ✉️ Newsletter
        </Link>
        <Link className="adm-btn" href="/admin/comments">
          💬 Moderate comments
        </Link>
      </div>
    </div>
  );
}
