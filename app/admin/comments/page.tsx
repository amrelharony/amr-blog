"use client";
import { useCallback, useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/browser";
import { relTime } from "@/lib/microblog-format";

interface CommentRow {
  id: string;
  article_id: string;
  author_name: string;
  content: string;
  created_at: string;
  likes: number;
  parent_id: string | null;
}

export default function AdminComments() {
  const sb = getBrowserClient();
  const [rows, setRows] = useState<CommentRow[]>([]);
  const [articles, setArticles] = useState<Record<string, { title: string; slug: string }>>({});

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
      const { data: arts } = await sb.from("longform_articles").select("id,title,slug").in("id", ids);
      const map: Record<string, { title: string; slug: string }> = {};
      (arts || []).forEach((a: { id: string; title: string; slug: string }) => (map[a.id] = { title: a.title, slug: a.slug }));
      setArticles(map);
    }
  }, [sb]);
  useEffect(() => {
    load();
  }, [load]);

  const del = async (id: string) => {
    if (!confirm("Delete this comment?")) return;
    await sb.rpc("delete_article_comment", { p_comment_id: id });
    load();
  };

  return (
    <div>
      <div className="adm-h">Comments</div>
      <div className="adm-sub">{rows.length} article comments — moderate below.</div>
      <div className="adm-list">
        {rows.length === 0 && <div className="adm-sub">No comments yet.</div>}
        {rows.map((c) => (
          <div key={c.id} className="adm-list-item" style={{ cursor: "default", alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, marginBottom: 4, whiteSpace: "pre-wrap" }}>{c.content}</div>
              <div style={{ fontSize: 11, color: "var(--sub)" }}>
                <strong>{c.author_name}</strong> · {relTime(c.created_at)} · ❤ {c.likes || 0}
                {c.parent_id ? " · reply" : ""} ·{" "}
                {articles[c.article_id]?.slug ? (
                  <a href={`/p/${articles[c.article_id].slug}`} target="_blank" rel="noopener" title={c.article_id}>
                    {articles[c.article_id].title}
                  </a>
                ) : (
                  <span title={c.article_id}>article</span>
                )}
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
