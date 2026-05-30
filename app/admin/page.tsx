import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const sb = await createClient();
  const [articles, published, thoughts, subscribers, comments] = await Promise.all([
    sb.from("longform_articles").select("id", { count: "exact", head: true }).then((r) => r.count || 0),
    sb
      .from("longform_articles")
      .select("id", { count: "exact", head: true })
      .eq("published", true)
      .then((r) => r.count || 0),
    sb.from("microblog").select("id", { count: "exact", head: true }).then((r) => r.count || 0),
    sb
      .from("newsletter_subscribers")
      .select("id", { count: "exact", head: true })
      .eq("confirmed", true)
      .is("unsubscribed_at", null)
      .then((r) => r.count || 0),
    sb.from("article_comments").select("id", { count: "exact", head: true }).then((r) => r.count || 0),
  ]);

  const stats = [
    { num: published, label: "Published articles" },
    { num: articles - published, label: "Drafts" },
    { num: thoughts, label: "Thoughts" },
    { num: subscribers, label: "Subscribers" },
    { num: comments, label: "Comments" },
  ];

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
      <div className="adm-actions" style={{ marginTop: 20 }}>
        <Link className="adm-btn primary" href="/admin/write">
          ✍️ Write article
        </Link>
        <Link className="adm-btn" href="/admin/thoughts">
          💭 New thought
        </Link>
        <Link className="adm-btn" href="/admin/subscribers">
          ✉️ Subscribers
        </Link>
        <Link className="adm-btn" href="/admin/comments">
          💬 Moderate comments
        </Link>
      </div>
    </div>
  );
}
