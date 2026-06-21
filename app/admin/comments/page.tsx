"use client";
import { useCallback, useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/browser";
import { relTime } from "@/lib/microblog-format";
import { logActivity } from "@/lib/activity";

const PAGE = 50;
type StatusFilter = "all" | "pending" | "approved" | "spam";

interface CommentRow {
  id: string;
  article_id: string;
  author_name: string;
  content: string;
  created_at: string;
  likes: number;
  parent_id: string | null;
  status: string;
}

const statusPill = (s: string) => (s === "approved" ? "live" : s === "spam" ? "draft" : "sched");

export default function AdminComments() {
  const sb = getBrowserClient();
  const [rows, setRows] = useState<CommentRow[]>([]);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    let q = sb
      .from("article_comments")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (status !== "all") q = q.eq("status", status);
    const { data, count: c } = await q;
    const list = (data || []) as CommentRow[];
    setRows(list);
    setCount(c || 0);
    const ids = [...new Set(list.map((x) => x.article_id))];
    if (ids.length) {
      const { data: arts } = await sb.from("longform_articles").select("id,title").in("id", ids);
      const map: Record<string, string> = {};
      (arts || []).forEach((a: { id: string; title: string }) => (map[a.id] = a.title));
      setTitles(map);
    }
    setBusy(false);
  }, [sb, page, status]);
  useEffect(() => {
    load();
  }, [load]);

  const toggleSel = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleSelAll = () =>
    setSelected((s) => {
      const allSel = rows.length > 0 && rows.every((r) => s.has(r.id));
      const n = new Set(s);
      rows.forEach((r) => (allSel ? n.delete(r.id) : n.add(r.id)));
      return n;
    });

  const moderate = async (newStatus: "approved" | "pending" | "spam") => {
    const ids = [...selected];
    if (!ids.length) return;
    setBusy(true);
    const { error } = await sb.rpc("set_comment_status", { p_ids: ids, p_status: newStatus });
    setBusy(false);
    if (error) setMsg("Failed: " + error.message);
    else {
      await logActivity(sb, newStatus, "comment", null, `${ids.length} comment(s)`);
      setMsg(`Marked ${ids.length} ${newStatus}.`);
      setSelected(new Set());
      load();
    }
  };
  const removeSel = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} comment(s)? This cannot be undone.`)) return;
    setBusy(true);
    const { error } = await sb.rpc("delete_article_comments", { p_ids: ids });
    setBusy(false);
    if (error) setMsg("Failed: " + error.message);
    else {
      await logActivity(sb, "delete", "comment", null, `${ids.length} comment(s)`);
      setMsg(`Deleted ${ids.length}.`);
      setSelected(new Set());
      load();
    }
  };
  const delOne = async (id: string) => {
    if (!confirm("Delete this comment?")) return;
    const { error } = await sb.rpc("delete_article_comment", { p_comment_id: id });
    if (error) {
      setMsg("Failed: " + error.message);
      return;
    }
    await logActivity(sb, "delete", "comment", id, "");
    load();
  };

  const totalPages = Math.max(1, Math.ceil(count / PAGE));

  return (
    <div>
      <div className="adm-h">Comments</div>
      <div className="adm-sub">
        {count.toLocaleString()} {status === "all" ? "total" : status} comment{count !== 1 ? "s" : ""}
        {busy ? " · loading…" : ""} — moderate below.
      </div>

      <div className="adm-row" style={{ marginBottom: 12 }}>
        <select
          className="adm-select"
          style={{ maxWidth: 200 }}
          value={status}
          onChange={(e) => {
            setPage(0);
            setSelected(new Set());
            setStatus(e.target.value as StatusFilter);
          }}
        >
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="spam">Spam</option>
        </select>
      </div>

      {msg && (
        <div className="adm-msg ok" style={{ marginBottom: 12 }}>
          {msg}
        </div>
      )}

      {selected.size > 0 && (
        <div className="adm-card" style={{ padding: 12, marginBottom: 12 }}>
          <div className="adm-actions" style={{ marginTop: 0 }}>
            <span className="adm-sub" style={{ margin: 0 }}>
              {selected.size} selected
            </span>
            <button className="adm-btn" disabled={busy} onClick={() => moderate("approved")}>
              Approve
            </button>
            <button className="adm-btn" disabled={busy} onClick={() => moderate("spam")}>
              Mark spam
            </button>
            <button className="adm-btn" disabled={busy} onClick={() => moderate("pending")}>
              Unpublish
            </button>
            <button className="adm-btn danger" disabled={busy} onClick={removeSel}>
              Delete
            </button>
            <button className="adm-btn" disabled={busy} onClick={() => setSelected(new Set())}>
              Clear
            </button>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <label className="adm-check" style={{ cursor: "pointer", marginBottom: 8 }}>
          <input type="checkbox" checked={rows.every((r) => selected.has(r.id))} onChange={toggleSelAll} />
          Select page
        </label>
      )}

      <div className="adm-list">
        {rows.length === 0 && <div className="adm-sub">No comments.</div>}
        {rows.map((c) => (
          <div key={c.id} className="adm-list-item" style={{ cursor: "default", alignItems: "flex-start" }}>
            <input
              type="checkbox"
              checked={selected.has(c.id)}
              onChange={() => toggleSel(c.id)}
              style={{ marginTop: 3 }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, marginBottom: 4, whiteSpace: "pre-wrap" }}>{c.content}</div>
              <div style={{ fontSize: 11, color: "var(--sub)" }}>
                <strong>{c.author_name}</strong> · {relTime(c.created_at)} · ❤ {c.likes || 0}
                {c.parent_id ? " · reply" : ""} · <span title={c.article_id}>{titles[c.article_id] || "article"}</span>
              </div>
            </div>
            <span className={"adm-pill " + statusPill(c.status)}>{c.status}</span>
            <button className="adm-btn danger" onClick={() => delOne(c.id)}>
              Delete
            </button>
          </div>
        ))}
      </div>

      {count > PAGE && (
        <div className="adm-actions" style={{ marginTop: 16, justifyContent: "space-between" }}>
          <button className="adm-btn" disabled={page <= 0 || busy} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            ← Prev
          </button>
          <span className="adm-sub" style={{ margin: 0 }}>
            Page {page + 1} / {totalPages}
          </span>
          <button className="adm-btn" disabled={page + 1 >= totalPages || busy} onClick={() => setPage((p) => p + 1)}>
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
