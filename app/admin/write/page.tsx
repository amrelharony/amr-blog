"use client";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase/browser";
import { slugify, fmtDate, toLocalInput } from "@/lib/format";
import { isSlugTaken } from "@/lib/slug";
import { relTime } from "@/lib/microblog-format";
import { filterSort, pubStatus } from "@/lib/admin-filter";
import { toast } from "@/lib/toast";
import AdminListToolbar from "@/components/AdminListToolbar";

interface Row {
  id: string;
  title: string;
  slug: string;
  published: boolean;
  scheduled_at: string | null;
  created_at: string;
}

const LIST_COMPARATORS: Record<string, (a: Row, b: Row) => number> = {
  newest: (a, b) => b.created_at.localeCompare(a.created_at),
  oldest: (a, b) => a.created_at.localeCompare(b.created_at),
  title: (a, b) => a.title.localeCompare(b.title),
};
const STATUS_OPTS = [
  { value: "all", label: "All" },
  { value: "live", label: "Live" },
  { value: "draft", label: "Draft" },
  { value: "sched", label: "Scheduled" },
];
const SORT_OPTS = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "title", label: "Title A–Z" },
];

// Snapshots written by the save_article_version RPC before each update.
interface ArticleVersion {
  id: string;
  version_number: number;
  title: string;
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
  tldr: "",
};

type FormState = typeof EMPTY;
// Per-article localStorage autosave key (new articles share one "new" slot).
const draftKey = (id: string) => `_lb_article_draft_${id || "new"}`;

function WriteEditor() {
  const sb = getBrowserClient();
  const searchParams = useSearchParams();
  const [list, setList] = useState<Row[]>([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [slugLocked, setSlugLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [reviewUrl, setReviewUrl] = useState("");
  // Article-list view: search/filter/sort + multi-select.
  const [listQuery, setListQuery] = useState("");
  const [listStatus, setListStatus] = useState("all");
  const [listSort, setListSort] = useState("newest");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showHistory, setShowHistory] = useState(false);
  const [versions, setVersions] = useState<ArticleVersion[]>([]);
  const [dirty, setDirty] = useState(false);
  const [draft, setDraft] = useState<{ form: FormState; at: number } | null>(null);
  // Skip the first autosave write after a load so it can't clobber an existing
  // draft before the author decides whether to restore it.
  const skipPersist = useRef(true);
  // Monotonic guard so a slow startEdit fetch can't apply after a newer
  // startEdit/startNew (rapid clicks on different list items would otherwise
  // pair one article's form with another's restore banner).
  const editSeq = useRef(0);

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

  const set = (k: string, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };

  // Surface an unsaved localStorage draft for restore (set before loading form).
  const checkDraft = (id: string) => {
    try {
      const raw = localStorage.getItem(draftKey(id));
      if (!raw) return setDraft(null);
      const d = JSON.parse(raw);
      if (d?.form?.title !== undefined) setDraft({ form: d.form, at: d.at || 0 });
      else setDraft(null);
    } catch {
      setDraft(null);
    }
  };

  const startNew = () => {
    editSeq.current++; // supersede any in-flight startEdit
    skipPersist.current = true;
    setForm({ ...EMPTY });
    setSlugLocked(false);
    setReviewUrl("");
    setMsg(null);
    setDirty(false);
    setEditing(true);
    checkDraft("");
  };

  // Open a fresh editor when navigated with ?new (e.g. from the ⌘K palette);
  // re-runs on query change so it works even when already on this page.
  useEffect(() => {
    if (searchParams.get("new") !== null) startNew();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const startEdit = async (id: string) => {
    const seq = ++editSeq.current;
    const { data } = await sb.from("longform_articles").select("*").eq("id", id).single();
    // Bail if a newer startEdit/startNew has since taken over.
    if (seq !== editSeq.current || !data) return;
    skipPersist.current = true;
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
      tldr: data.tldr || "",
    });
    setSlugLocked(true);
    setReviewUrl("");
    setMsg(null);
    setDirty(false);
    setEditing(true);
    checkDraft(id);
  };

  // Debounced autosave of the in-progress form to localStorage.
  useEffect(() => {
    if (!editing) return;
    // Hold off while a restore decision is pending, so edits can't overwrite
    // the very draft the author may want to restore.
    if (draft) return;
    if (skipPersist.current) {
      skipPersist.current = false;
      return;
    }
    const k = draftKey(form.id);
    const t = setTimeout(() => {
      try {
        localStorage.setItem(k, JSON.stringify({ form, at: Date.now() }));
      } catch {
        /* quota — ignore */
      }
    }, 800);
    return () => clearTimeout(t);
  }, [form, editing, draft]);

  // Warn before navigating away from unsaved changes.
  useEffect(() => {
    if (!editing || !dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [editing, dirty]);

  const clearDraft = () => {
    try {
      localStorage.removeItem(draftKey(form.id));
    } catch {
      /* ignore */
    }
  };

  const restoreDraft = () => {
    if (!draft) return;
    skipPersist.current = true;
    setForm(draft.form);
    setSlugLocked(true);
    setDraft(null);
    setDirty(true);
    setMsg({ t: "Draft restored.", ok: true });
  };

  const discardDraft = () => {
    clearDraft();
    setDraft(null);
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
      tldr: form.tldr.trim() || null,
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
      let savedId = form.id;
      if (form.id) {
        await sb.rpc("save_article_version", { p_article_id: form.id }); // snapshot before overwrite
        const { error } = await sb.from("longform_articles").update(row).eq("id", form.id);
        if (error) throw error;
      } else {
        // Capture the new id so a second save updates (not re-inserts) and so
        // autosave moves off the shared "new" draft slot onto this article.
        const { data: inserted, error } = await sb
          .from("longform_articles")
          .insert(row)
          .select("id")
          .single();
        if (error) throw error;
        savedId = inserted?.id || "";
      }
      await revalidate(slug);
      clearDraft(); // clears the key for the slot we saved under (form.id here)
      setDirty(false);
      setMsg({ t: "Saved.", ok: true });
      setSlugLocked(true);
      skipPersist.current = true; // don't let the form update below re-create the draft
      setForm((f) => ({ ...f, slug, id: savedId }));
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
    if (error) {
      toast.err("Couldn't delete the article.");
      return;
    }
    await revalidate(slug);
    if (form.id === id) setEditing(false);
    toast.ok("Article deleted.");
    loadList();
  };

  const generateTldr = async () => {
    if (!form.content.trim()) {
      setMsg({ t: "Write the article content first.", ok: false });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: form.title, content: form.content }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error((data?.error || `HTTP ${r.status}`) + (data?.detail ? ` — ${data.detail}` : ""));
      set("tldr", data.tldr);
      setMsg({ t: "TL;DR generated — review and edit before saving.", ok: true });
    } catch (e) {
      setMsg({ t: "TL;DR failed: " + (e as Error).message, ok: false });
    } finally {
      setBusy(false);
    }
  };

  const openHistory = async () => {
    if (!form.id) return;
    setShowHistory(true);
    const { data } = await sb
      .from("article_versions")
      .select("id,version_number,title,created_at")
      .eq("article_id", form.id)
      .order("version_number", { ascending: false });
    setVersions((data || []) as ArticleVersion[]);
  };

  const restoreVersion = async (v: ArticleVersion) => {
    if (!confirm(`Load v${v.version_number} into the editor? Unsaved changes will be replaced (saving snapshots the current version first).`))
      return;
    const { data, error } = await sb
      .from("article_versions")
      .select("title,content,excerpt,tags")
      .eq("id", v.id)
      .single();
    if (error || !data) {
      toast.err("Couldn't load that version.");
      return;
    }
    skipPersist.current = true; // don't clobber the localStorage draft on this programmatic load
    setForm((f) => ({
      ...f,
      title: data.title || "",
      content: data.content || "",
      excerpt: data.excerpt || "",
      tags: (data.tags || []).join(", "),
    }));
    setDirty(true);
    setShowHistory(false);
    toast.ok(`Loaded v${v.version_number} — review, then save.`);
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
    const visible = filterSort(list, {
      query: listQuery,
      fields: (a) => [a.title, a.slug],
      status: listStatus,
      statusOf: pubStatus,
      sort: listSort,
      comparators: LIST_COMPARATORS,
    });
    const allSelected = visible.length > 0 && visible.every((a) => selected.has(a.id));
    const toggleAll = () =>
      setSelected(allSelected ? new Set() : new Set(visible.map((a) => a.id)));
    const toggleOne = (id: string) =>
      setSelected((s) => {
        const n = new Set(s);
        if (n.has(id)) n.delete(id);
        else n.add(id);
        return n;
      });
    const bulkDelete = async () => {
      const targets = visible.filter((a) => selected.has(a.id));
      if (!targets.length || !confirm(`Delete ${targets.length} article(s)? This cannot be undone.`)) return;
      const ids = new Set(targets.map((a) => a.id));
      setList((p) => p.filter((a) => !ids.has(a.id))); // optimistic
      setSelected(new Set());
      const failed: Row[] = [];
      for (const a of targets) {
        const { error } = await sb.from("longform_articles").delete().eq("id", a.id);
        if (error) failed.push(a);
        else revalidate(a.slug);
      }
      if (failed.length) {
        setList((p) =>
          [...p, ...failed].sort((x, y) => y.created_at.localeCompare(x.created_at)),
        );
        toast.err(`${failed.length} couldn't be deleted (not permitted).`);
      }
      const ok = targets.length - failed.length;
      if (ok) toast.ok(`Deleted ${ok} article${ok > 1 ? "s" : ""}.`);
    };

    return (
      <div>
        <div className="adm-h">Articles</div>
        <div className="adm-sub">
          {visible.length} of {list.length} — click to edit.
        </div>
        <div className="adm-actions" style={{ marginBottom: 16 }}>
          <button className="adm-btn primary" onClick={startNew}>
            + New article
          </button>
        </div>
        <AdminListToolbar
          query={listQuery}
          onQuery={setListQuery}
          placeholder="Search title or slug…"
          status={listStatus}
          onStatus={setListStatus}
          statusOptions={STATUS_OPTS}
          sort={listSort}
          onSort={setListSort}
          sortOptions={SORT_OPTS}
          selectable
          allSelected={allSelected}
          onToggleAll={toggleAll}
          selectedCount={selected.size}
          onBulkDelete={bulkDelete}
          bulkDeleteLabel="Delete selected"
          onClearSelection={() => setSelected(new Set())}
        />
        <div className="adm-list">
          {visible.map((a) => (
            <div key={a.id} className="adm-list-item" onClick={() => startEdit(a.id)}>
              <input
                type="checkbox"
                className="adm-rowcheck"
                checked={selected.has(a.id)}
                onClick={(e) => e.stopPropagation()}
                onChange={() => toggleOne(a.id)}
                aria-label={`Select ${a.title}`}
              />
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

      {draft && (
        <div className="adm-msg ok" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span>
            Unsaved draft found{draft.at ? ` (${relTime(new Date(draft.at).toISOString())})` : ""}.
          </span>
          <button className="adm-btn" onClick={restoreDraft}>
            Restore
          </button>
          <button className="adm-btn" onClick={discardDraft}>
            Discard
          </button>
        </div>
      )}

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
            {isSlugTaken((form.slug || slugify(form.title)).trim(), form.id, list) && (
              <div className="adm-msg err" style={{ marginTop: 6 }}>
                Another article already uses this slug.
              </div>
            )}
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
        <div className="adm-field">
          <label className="adm-label">
            TL;DR (AI summary — shown atop the article)
          </label>
          <textarea
            className="adm-textarea"
            style={{ minHeight: 70 }}
            value={form.tldr}
            onChange={(e) => set("tldr", e.target.value)}
            placeholder="Generate from the content below, then edit. Leave blank to hide."
          />
          <div style={{ marginTop: 6 }}>
            <button className="adm-btn" type="button" disabled={busy} onClick={generateTldr}>
              ✨ Generate TL;DR
            </button>
          </div>
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
              <button className="adm-btn" disabled={busy} onClick={openHistory}>
                History
              </button>
              <button className="adm-btn" disabled={busy} onClick={makeReviewLink}>
                Review link
              </button>
              <button className="adm-btn danger" disabled={busy} onClick={() => del(form.id, form.slug)}>
                Delete
              </button>
            </>
          )}
        </div>
        {showHistory && (
          <div className="adm-card" style={{ marginTop: 12 }}>
            <div className="adm-actions" style={{ marginTop: 0, justifyContent: "space-between" }}>
              <span className="adm-label" style={{ margin: 0 }}>
                Version history ({versions.length})
              </span>
              <button className="adm-btn" onClick={() => setShowHistory(false)}>
                Close
              </button>
            </div>
            {versions.length === 0 ? (
              <div className="adm-sub" style={{ marginTop: 10 }}>
                No snapshots yet — they&apos;re recorded each time you save.
              </div>
            ) : (
              <div className="adm-list" style={{ marginTop: 10 }}>
                {versions.map((v) => (
                  <div key={v.id} className="adm-list-item" style={{ cursor: "default" }}>
                    <span className="adm-pill">v{v.version_number}</span>
                    <span className="adm-list-title" style={{ fontWeight: 400, fontSize: 13 }}>
                      {v.title || "(untitled)"}
                    </span>
                    <span className="adm-pill">{fmtDate(v.created_at)}</span>
                    <button className="adm-btn" onClick={() => restoreVersion(v)}>
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
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

// useSearchParams() requires a Suspense boundary at the page level (Next 16).
export default function WritePage() {
  return (
    <Suspense fallback={null}>
      <WriteEditor />
    </Suspense>
  );
}
