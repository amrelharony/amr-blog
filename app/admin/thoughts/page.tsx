"use client";
import { useCallback, useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/browser";
import { relTime } from "@/lib/microblog-format";
import type { Thought } from "@/lib/types";

const MAX = 500;

export default function AdminThoughts() {
  const sb = getBrowserClient();
  const [list, setList] = useState<Thought[]>([]);
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [scheduled, setScheduled] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    const { data } = await sb
      .from("microblog")
      .select("*")
      .order("pinned", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(50);
    setList((data || []) as Thought[]);
  }, [sb]);
  useEffect(() => {
    load();
  }, [load]);

  const revalidate = async () => {
    try {
      await fetch("/api/revalidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
    } catch {
      /* non-fatal */
    }
  };

  const post = async (mode: "publish" | "draft" | "schedule") => {
    if (!content.trim() && !file) {
      setMsg({ t: "Write something or attach an image.", ok: false });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      let image_url: string | null = null;
      if (file) {
        const fn = `mb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${file.name.split(".").pop()}`;
        const { data, error } = await sb.storage.from("microblog-images").upload(fn, file, { upsert: false });
        if (error) throw error;
        image_url = sb.storage.from("microblog-images").getPublicUrl(data.path).data.publicUrl;
      }
      // Leave linkedin_posted at its default (false) so the hourly LinkedIn cron
      // (scripts/publish-linkedin.mjs) can pick up published/scheduled thoughts.
      const row: Record<string, unknown> = { content: content.trim(), published: mode === "publish" };
      if (image_url) row.image_url = image_url;
      // [poll:Question?|Option 1|Option 2]
      const pollMatch = content.match(/\[poll:(.+?)\|(.+?)\]/);
      if (pollMatch) {
        row.poll = {
          question: pollMatch[1].trim(),
          options: pollMatch[2].split("|").map((o) => ({ text: o.trim(), votes: 0 })),
        };
        row.content = content.replace(/\[poll:.+?\]/, "").trim() || pollMatch[1].trim();
      }
      if (mode === "schedule") {
        if (!scheduled) {
          setMsg({ t: "Pick a schedule date.", ok: false });
          setBusy(false);
          return;
        }
        row.published = false;
        row.scheduled_at = new Date(scheduled).toISOString();
      }
      const { error } = await sb.from("microblog").insert(row);
      if (error) throw error;
      setContent("");
      setFile(null);
      setScheduled("");
      setMsg({ t: "Posted.", ok: true });
      await revalidate();
      load();
    } catch (e) {
      setMsg({ t: "Failed: " + (e as Error).message, ok: false });
    } finally {
      setBusy(false);
    }
  };

  const togglePin = async (t: Thought) => {
    await sb.from("microblog").update({ pinned: !t.pinned }).eq("id", t.id);
    await revalidate();
    load();
  };
  const del = async (id: string) => {
    if (!confirm("Delete this thought?")) return;
    await sb.from("microblog").delete().eq("id", id);
    await revalidate();
    load();
  };

  return (
    <div>
      <div className="adm-h">Thoughts</div>
      <div className="adm-sub">Short-form posts for /thoughts. Markdown · #hashtags · poll syntax.</div>

      <div className="adm-card">
        <div className="adm-field">
          <label className="adm-label">
            Content ({content.length}/{MAX}) — poll: <code>[poll:Question?|Option 1|Option 2]</code>
          </label>
          <textarea
            className="adm-textarea"
            style={{ minHeight: 120 }}
            maxLength={MAX}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What's on your mind?"
          />
        </div>
        <div className="adm-field">
          <label className="adm-label">Image (optional)</label>
          <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          {file && <span style={{ fontSize: 12, marginLeft: 8 }}>{file.name}</span>}
        </div>
        <div className="adm-actions">
          <button className="adm-btn primary" disabled={busy} onClick={() => post("publish")}>
            Post
          </button>
          <button className="adm-btn" disabled={busy} onClick={() => post("draft")}>
            Save draft
          </button>
          <input
            className="adm-input"
            style={{ maxWidth: 210 }}
            type="datetime-local"
            value={scheduled}
            onChange={(e) => setScheduled(e.target.value)}
          />
          <button className="adm-btn" disabled={busy} onClick={() => post("schedule")}>
            Schedule
          </button>
        </div>
        {msg && <div className={"adm-msg " + (msg.ok ? "ok" : "err")}>{msg.t}</div>}
      </div>

      <div className="adm-sub">{list.length} thoughts</div>
      <div className="adm-list">
        {list.map((t) => (
          <div key={t.id} className="adm-list-item">
            <span className="adm-list-title" style={{ fontWeight: 400, fontSize: 13 }}>
              {(t.content || "(image only)").slice(0, 90)}
            </span>
            <span className="adm-pill">{relTime(t.created_at)}</span>
            {t.pinned && <span className="adm-pill sched">📌</span>}
            {t.published ? (
              <span className="adm-pill live">Live</span>
            ) : t.scheduled_at ? (
              <span className="adm-pill sched">Scheduled</span>
            ) : (
              <span className="adm-pill draft">Draft</span>
            )}
            <button className="adm-btn" onClick={() => togglePin(t)}>
              {t.pinned ? "Unpin" : "Pin"}
            </button>
            <button className="adm-btn danger" onClick={() => del(t.id)}>
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
