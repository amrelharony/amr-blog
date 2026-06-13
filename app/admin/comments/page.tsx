"use client";
import { useCallback, useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/browser";
import { relTime } from "@/lib/microblog-format";
import { filterSort } from "@/lib/admin-filter";
import { toast } from "@/lib/toast";
import AdminListToolbar from "@/components/AdminListToolbar";

interface CommentRow {
  id: string;
  article_id: string;
  author_name: string;
  content: string;
  created_at: string;
  likes: number;
  parent_id: string | null;
}

const C_COMPARATORS: Record<string, (a: CommentRow, b: CommentRow) => number> = {
  newest: (a, b) => b.created_at.localeCompare(a.created_at),
  oldest: (a, b) => a.created_at.localeCompare(b.created_at),
  likes: (a, b) => (b.likes || 0) - (a.likes || 0),
};
const C_STATUS = [
  { value: "all", label: "All" },
  { value: "top", label: "Top-level" },
  { value: "reply", label: "Replies" },
];
const C_SORT = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "likes", label: "Most liked" },
];

export default function AdminComments() {
  const sb = getBrowserClient();
  const [rows, setRows] = useState<CommentRow[]>([]);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [statusF, setStatusF] = useState("all");
  const [sortF, setSortF] = useState("newest");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const { data } = await sb
      .from("article_comments")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);
    const list = (data || []) as CommentRow[];
    setRows(list);
    const ids = [...new Set(list.map((c) => c.article_id))];
    if (ids.length) {
      const { data: arts } = await sb.from("longform_articles").select("id,title").in("id", ids);
      const map: Record<string, string> = {};
      (arts || []).forEach((a: { id: string; title: string }) => (map[a.id] = a.title));
      setTitles(map);
    }
  }, [sb]);
  useEffect(() => {
    load();
  }, [load]);

  const del = async (id: string) => {
    if (!confirm("Delete this comment?")) return;
    const prev = rows;
    setRows((p) => p.filter((c) => c.id !== id)); // optimistic
    const { error } = await sb.rpc("delete_article_comment", { p_comment_id: id });
    if (error) {
      setRows(prev);
      toast.err("Couldn't delete.");
      return;
    }
    toast.ok("Comment deleted.");
  };

  const visible = filterSort(rows, {
    query,
    fields: (c) => [c.content, c.author_name, titles[c.article_id] || ""],
    status: statusF,
    statusOf: (c) => (c.parent_id ? "reply" : "top"),
    sort: sortF,
    comparators: C_COMPARATORS,
  });
  const allSelected = visible.length > 0 && visible.every((c) => selected.has(c.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(visible.map((c) => c.id)));
  const toggleOne = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const bulkDelete = async () => {
    const targets = visible.filter((c) => selected.has(c.id));
    if (!targets.length || !confirm(`Delete ${targets.length} comment(s)?`)) return;
    const ids = new Set(targets.map((c) => c.id));
    setRows((p) => p.filter((c) => !ids.has(c.id))); // optimistic
    setSelected(new Set());
    const failed: CommentRow[] = [];
    for (const c of targets) {
      const { error } = await sb.rpc("delete_article_comment", { p_comment_id: c.id });
      if (error) failed.push(c);
    }
    if (failed.length) {
      setRows((p) => [...failed, ...p]);
      toast.err(`${failed.length} couldn't be deleted.`);
    }
    const ok = targets.length - failed.length;
    if (ok) toast.ok(`Deleted ${ok} comment${ok > 1 ? "s" : ""}.`);
  };

  return (
    <div>
      <div className="adm-h">Comments</div>
      <div className="adm-sub">
        {visible.length} of {rows.length} comments — moderate below.
      </div>
      <AdminListToolbar
        query={query}
        onQuery={setQuery}
        placeholder="Search content, author, article…"
        status={statusF}
        onStatus={setStatusF}
        statusOptions={C_STATUS}
        sort={sortF}
        onSort={setSortF}
        sortOptions={C_SORT}
        selectable
        allSelected={allSelected}
        onToggleAll={toggleAll}
        selectedCount={selected.size}
        onBulkDelete={bulkDelete}
        bulkDeleteLabel="Delete selected"
        onClearSelection={() => setSelected(new Set())}
      />
      <div className="adm-list">
        {visible.length === 0 && <div className="adm-sub">No comments match.</div>}
        {visible.map((c) => (
          <div key={c.id} className="adm-list-item" style={{ cursor: "default", alignItems: "flex-start" }}>
            <input
              type="checkbox"
              className="adm-rowcheck"
              checked={selected.has(c.id)}
              onChange={() => toggleOne(c.id)}
              aria-label="Select comment"
              style={{ marginTop: 2 }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, marginBottom: 4, whiteSpace: "pre-wrap" }}>{c.content}</div>
              <div style={{ fontSize: 11, color: "var(--sub)" }}>
                <strong>{c.author_name}</strong> · {relTime(c.created_at)} · ❤ {c.likes || 0}
                {c.parent_id ? " · reply" : ""} ·{" "}
                <a href={`/p/${""}`} onClick={(e) => e.preventDefault()} title={c.article_id}>
                  {titles[c.article_id] || "article"}
                </a>
              </div>
            </div>
            <button className="adm-btn danger" onClick={() => del(c.id)}>
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
