"use client";
import { useCallback, useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/browser";
import { slugify, fmtDate } from "@/lib/format";

interface Row {
  id: string;
  title: string;
  slug: string;
  published: boolean;
  scheduled_at: string | null;
  created_at: string;
}

const EMPTY = {
  id: "",
  title: "",
  slug: "",
  excerpt: "",
  content: "",
  cover_image: "",
  tags: "",
  series_name: "",
  series_order: "0",
  scheduled: "",
};

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

export default function WritePage() {
  const sb = getBrowserClient();
  const [list, setList] = useState<Row[]>([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [slugLocked, setSlugLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [reviewUrl, setReviewUrl] = useState("");

  const loadList = useCallback(async () => {
    const { data } = await sb
      .from("longform_articles")
      .select("id,title,slug,published,scheduled_at,created_at")
      .order("created_at", { ascending: false });
    setList((data || []) as Row[]);
  }, [sb]);
  useEffect(() => {
    loadList();
  }, [loadList]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const startNew = () => {
    setForm({ ...EMPTY });
    setSlugLocked(false);
    setReviewUrl("");
    setMsg(null);
    setEditing(true);
  };

  const startEdit = async (id: string) => {
    const { data } = await sb.from("longform_articles").select("*").eq("id", id).single();
    if (!data) return;
    setForm({
      id: data.id,
      title: data.title || "",
      slug: data.slug || "",
      excerpt: data.excerpt || "",
      content: data.content || "",
      cover_image: data.cover_image || "",
      tags: (data.tags || []).join(", "),
      series_name: data.series_name || "",
      series_order: String(data.series_order ?? 0),
      scheduled: toLocalInput(data.scheduled_at),
    });
    setSlugLocked(true);
    setReviewUrl("");
    setMsg(null);
    setEditing(true);
  };

  const revalidate = async (slug: string) => {
    try {
      await fetch("/api/revalidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
    } catch {
      /* non-fatal */
    }
  };

  const uploadCover = async (file: File) => {
    setBusy(true);
    try {
      const fn = `cover_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${file.name.split(".").pop()}`;
      const { data, error } = await sb.storage.from("microblog-images").upload(fn, file, { upsert: false });
      if (error) throw error;
      const { data: pub } = sb.storage.from("microblog-images").getPublicUrl(data.path);
      set("cover_image", pub.publicUrl);
      setMsg({ t: "Cover uploaded.", ok: true });
    } catch (e) {
      setMsg({ t: "Upload failed: " + (e as Error).message, ok: false });
    } finally {
      setBusy(false);
    }
  };

  const save = async (mode: "draft" | "publish" | "schedule") => {
    if (!form.title.trim()) {
      setMsg({ t: "Title is required.", ok: false });
      return;
    }
    setBusy(true);
    setMsg(null);
    const slug = (form.slug || slugify(form.title)).trim();
    const row: Record<string, unknown> = {
      title: form.title.trim(),
      slug,
      excerpt: form.excerpt.trim(),
      content: form.content,
      cover_image: form.cover_image.trim(),
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      series_name: form.series_name.trim() || null,
      series_order: Number(form.series_order) || 0,
    };
    if (mode === "publish") {
      row.published = true;
      row.scheduled_at = null;
    } else if (mode === "draft") {
      row.published = false;
      // Clear any prior schedule, otherwise publish_scheduled_posts (db-keepalive cron)
      // would later auto-publish an article the author meant to hold as a draft.
      row.scheduled_at = null;
    } else {
      if (!form.scheduled) {
        setMsg({ t: "Pick a schedule date.", ok: false });
        setBusy(false);
        return;
      }
      row.published = false;
      row.scheduled_at = new Date(form.scheduled).toISOString();
    }

    try {
      if (form.id) {
        await sb.rpc("save_article_version", { p_article_id: form.id }); // snapshot before overwrite
        const { error } = await sb.from("longform_articles").update(row).eq("id", form.id);
        if (error) throw error;
      } else {
        // Capture the new id so a subsequent Save/Publish UPDATEs this row instead
        // of inserting a duplicate (which would also collide on the unique slug).
        const { data, error } = await sb
          .from("longform_articles")
          .insert(row)
          .select("id")
          .single();
        if (error) throw error;
        setForm((f) => ({ ...f, id: (data as { id: string }).id }));
      }
      await revalidate(slug);
      setMsg({ t: "Saved.", ok: true });
      setSlugLocked(true);
      setForm((f) => ({ ...f, slug }));
      loadList();
    } catch (e) {
      setMsg({ t: "Save failed: " + (e as Error).message, ok: false });
    } finally {
      setBusy(false);
    }
  };

  const del = async (id: string, slug: string) => {
    if (!confirm("Delete this article? This cannot be undone.")) return;
    const { error } = await sb.from("longform_articles").delete().eq("id", id);
    if (!error) {
      await revalidate(slug);
      if (form.id === id) setEditing(false);
      loadList();
    }
  };

  const makeReviewLink = async () => {
    if (!form.id) {
      setMsg({ t: "Save the article first.", ok: false });
      return;
    }
    const token = crypto.randomUUID();
    const { error } = await sb.rpc("create_review_link", { p_article_id: form.id, p_token: token });
    if (error) {
      setMsg({ t: "Review link failed: " + error.message, ok: false });
      return;
    }
    setReviewUrl(`${location.origin}/review/${token}`);
  };

  if (!editing) {
    return (
      <div>
        <div className="adm-h">Articles</div>
        <div className="adm-sub">{list.length} total — click to edit.</div>
        <div className="adm-actions" style={{ marginBottom: 16 }}>
          <button className="adm-btn primary" onClick={startNew}>
            + New article
          </button>
        </div>
        <div className="adm-list">
          {list.map((a) => (
            <div key={a.id} className="adm-list-item" onClick={() => startEdit(a.id)}>
              <span className="adm-list-title">{a.title}</span>
              <span className="adm-pill">{fmtDate(a.created_at)}</span>
              {a.published ? (
                <span className="adm-pill live">Live</span>
              ) : a.scheduled_at ? (
                <span className="adm-pill sched">Scheduled</span>
              ) : (
                <span className="adm-pill draft">Draft</span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="adm-actions" style={{ marginBottom: 12 }}>
        <button className="adm-btn" onClick={() => setEditing(false)}>
          ← Back to list
        </button>
        {form.slug && form.id && (
          <a className="adm-btn" href={`/p/${form.slug}`} target="_blank" rel="noopener">
            View ↗
          </a>
        )}
      </div>

      <div className="adm-card">
        <div className="adm-field">
          <label className="adm-label">Title</label>
          <input
            className="adm-input"
            value={form.title}
            onChange={(e) => {
              set("title", e.target.value);
              if (!slugLocked) set("slug", slugify(e.target.value));
            }}
          />
        </div>
        <div className="adm-row">
          <div className="adm-field">
            <label className="adm-label">Slug</label>
            <input className="adm-input" value={form.slug} onChange={(e) => { setSlugLocked(true); set("slug", e.target.value); }} />
          </div>
          <div className="adm-field">
            <label className="adm-label">Tags (comma-separated)</label>
            <input className="adm-input" value={form.tags} onChange={(e) => set("tags", e.target.value)} />
          </div>
        </div>
        <div className="adm-field">
          <label className="adm-label">Excerpt</label>
          <input className="adm-input" value={form.excerpt} onChange={(e) => set("excerpt", e.target.value)} />
        </div>
        <div className="adm-row">
          <div className="adm-field">
            <label className="adm-label">Series name (optional)</label>
            <input className="adm-input" value={form.series_name} onChange={(e) => set("series_name", e.target.value)} />
          </div>
          <div className="adm-field" style={{ maxWidth: 140 }}>
            <label className="adm-label">Series order</label>
            <input className="adm-input" type="number" value={form.series_order} onChange={(e) => set("series_order", e.target.value)} />
          </div>
        </div>
        <div className="adm-field">
          <label className="adm-label">Cover image URL</label>
          <input className="adm-input" value={form.cover_image} onChange={(e) => set("cover_image", e.target.value)} placeholder="https://… or upload below" />
          <div style={{ marginTop: 6 }}>
            <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadCover(e.target.files[0])} />
          </div>
        </div>
        <div className="adm-field">
          <label className="adm-label">Content (Markdown)</label>
          <textarea className="adm-textarea" value={form.content} onChange={(e) => set("content", e.target.value)} />
        </div>

        <div className="adm-actions">
          <button className="adm-btn primary" disabled={busy} onClick={() => save("publish")}>
            Publish
          </button>
          <button className="adm-btn" disabled={busy} onClick={() => save("draft")}>
            Save draft
          </button>
          <input className="adm-input" style={{ maxWidth: 210 }} type="datetime-local" value={form.scheduled} onChange={(e) => set("scheduled", e.target.value)} />
          <button className="adm-btn" disabled={busy} onClick={() => save("schedule")}>
            Schedule
          </button>
          {form.id && (
            <>
              <button className="adm-btn" disabled={busy} onClick={makeReviewLink}>
                Review link
              </button>
              <button className="adm-btn danger" disabled={busy} onClick={() => del(form.id, form.slug)}>
                Delete
              </button>
            </>
          )}
        </div>
        {msg && <div className={"adm-msg " + (msg.ok ? "ok" : "err")}>{msg.t}</div>}
        {reviewUrl && (
          <div className="adm-msg ok">
            Review link (7-day): <a href={reviewUrl}>{reviewUrl}</a>
          </div>
        )}
      </div>
    </div>
  );
}
