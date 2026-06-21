"use client";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { getBrowserClient } from "@/lib/supabase/browser";
import { slugify, fmtDate, readingTime } from "@/lib/format";
import { isSlugTaken } from "@/lib/slug";
import { relTime } from "@/lib/microblog-format";
import { CATEGORY_LABELS } from "@/lib/categories";
import { logActivity } from "@/lib/activity";
import {
  listAdminArticles,
  slugTakenServer,
  ADMIN_PAGE_SIZE,
  UNCATEGORIZED,
  type AdminArticleRow,
  type AdminStatus,
} from "@/lib/queries/admin-articles";

const EMPTY = {
  id: "",
  title: "",
  slug: "",
  excerpt: "",
  content: "",
  tags: "",
  category: CATEGORY_LABELS[0], // new posts default to the first category (Fintech)
  series_name: "",
  series_order: "0",
  scheduled: "",
  tldr: "",
};

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

type FormState = typeof EMPTY;
// Per-article localStorage autosave key (new articles share one "new" slot).
const draftKey = (id: string) => `_lb_article_draft_${id || "new"}`;

export default function WritePage() {
  const sb = getBrowserClient();
  const [list, setList] = useState<AdminArticleRow[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [qInput, setQInput] = useState(""); // raw search box value
  const [q, setQ] = useState(""); // debounced query actually sent
  const [status, setStatus] = useState<AdminStatus>("all");
  const [catFilter, setCatFilter] = useState("");
  const [listBusy, setListBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCat, setBulkCat] = useState(CATEGORY_LABELS[0]);
  const [listMsg, setListMsg] = useState("");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [slugLocked, setSlugLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [reviewUrl, setReviewUrl] = useState("");
  const [dirty, setDirty] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [versions, setVersions] = useState<
    { id: string; version_number: number; created_at: string; title: string }[]
  >([]);
  const [viewVer, setViewVer] = useState<{
    version_number: number;
    created_at: string;
    title: string;
    content: string;
    excerpt: string;
    tags: string[] | null;
  } | null>(null);
  const [previewOn, setPreviewOn] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewBusy, setPreviewBusy] = useState(false);
  const [loadedStatus, setLoadedStatus] = useState<"new" | "live" | "scheduled" | "draft">("new");
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const previewSeq = useRef(0); // discard out-of-order preview responses
  const [draft, setDraft] = useState<{ form: FormState; at: number } | null>(null);
  // Skip the first autosave write after a load so it can't clobber an existing
  // draft before the author decides whether to restore it.
  const skipPersist = useRef(true);
  // Monotonic guard so a slow startEdit fetch can't apply after a newer
  // startEdit/startNew (rapid clicks on different list items would otherwise
  // pair one article's form with another's restore banner).
  const editSeq = useRef(0);
  // The slug the open article was loaded with, so a rename can revalidate the OLD
  // /p/<slug> path too (otherwise the old URL serves stale ISR content).
  const origSlugRef = useRef("");

  const loadList = useCallback(async () => {
    setListBusy(true);
    try {
      const res = await listAdminArticles(sb, { page, q, status, category: catFilter });
      setList(res.rows);
      setCount(res.count);
      // If a delete shrank the set below this page's offset, step back into range.
      if (res.rows.length === 0 && res.count > 0 && page > 0) {
        setPage(Math.max(0, Math.ceil(res.count / ADMIN_PAGE_SIZE) - 1));
      }
    } catch {
      /* keep the prior list on a transient query error */
    } finally {
      setListBusy(false);
    }
  }, [sb, page, q, status, catFilter]);
  useEffect(() => {
    loadList();
  }, [loadList]);

  // Clear the selection whenever the visible result set changes, so a bulk action
  // can never operate on rows that scrolled off-screen (page/filter/search change).
  useEffect(() => {
    setSelected(new Set());
  }, [page, q, status, catFilter]);

  // Debounce the search box into the query (reset to page 0 on a new search).
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(0);
      setQ(qInput.trim());
    }, 400);
    return () => clearTimeout(t);
  }, [qInput]);

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
    origSlugRef.current = "";
    setForm({ ...EMPTY });
    setSlugLocked(false);
    setReviewUrl("");
    setMsg(null);
    setDirty(false);
    setLoadedStatus("new");
    setPreviewOn(false);
    setPreviewHtml("");
    setEditing(true);
    checkDraft("");
  };

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
      tags: (data.tags || []).join(", "),
      category: data.category || "", // null/legacy import → shows "Uncategorized"
      series_name: data.series_name || "",
      series_order: String(data.series_order ?? 0),
      scheduled: toLocalInput(data.scheduled_at),
      tldr: data.tldr || "",
    });
    origSlugRef.current = data.slug || "";
    setLoadedStatus(data.published ? "live" : data.scheduled_at ? "scheduled" : "draft");
    setPreviewOn(false);
    setPreviewHtml("");
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

  // Debounced live preview — renders through the SAME server pipeline as /p/[slug].
  useEffect(() => {
    if (!editing || !previewOn) return;
    const t = setTimeout(async () => {
      const seq = ++previewSeq.current;
      setPreviewBusy(true);
      try {
        const r = await fetch("/api/admin/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: form.content }),
        });
        const d = await r.json();
        if (seq === previewSeq.current && r.ok) setPreviewHtml(d.html || "");
      } catch {
        /* ignore preview errors */
      } finally {
        if (seq === previewSeq.current) setPreviewBusy(false);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [form.content, previewOn, editing]);

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
    // Backfill any keys a pre-update draft predates (e.g. category) from EMPTY,
    // so every field stays controlled.
    setForm({ ...EMPTY, ...draft.form });
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

  // ---- Bulk operations over the (paginated) list selection ----
  const toggleSel = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleSelAll = () =>
    setSelected((s) => {
      const allSel = list.length > 0 && list.every((a) => s.has(a.id));
      const next = new Set(s);
      list.forEach((a) => (allSel ? next.delete(a.id) : next.add(a.id)));
      return next;
    });

  const afterBulk = async (note: string) => {
    await revalidate(""); // global ISR refresh (no specific slug)
    await logActivity(sb, "bulk", "article", null, note);
    setSelected(new Set());
    setListMsg(note);
    loadList();
  };

  const bulkPublish = async (pub: boolean) => {
    const ids = [...selected];
    if (!ids.length) return;
    setListBusy(true);
    // Unpublish must also clear scheduled_at, else the publish_scheduled_posts cron
    // re-publishes the article on its next tick (matches single-article save('draft')).
    const row = pub ? { published: true, scheduled_at: null } : { published: false, scheduled_at: null };
    const { error } = await sb.from("longform_articles").update(row).in("id", ids);
    setListBusy(false);
    if (error) setListMsg("Failed: " + error.message);
    else afterBulk(`${pub ? "Published" : "Unpublished"} ${ids.length}.`);
  };

  const bulkCategory = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    setListBusy(true);
    const { error } = await sb.from("longform_articles").update({ category: bulkCat || null }).in("id", ids);
    setListBusy(false);
    if (error) setListMsg("Failed: " + error.message);
    else afterBulk(`Set ${ids.length} → ${bulkCat || "Uncategorized"}.`);
  };

  const bulkDelete = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} article(s)? This cannot be undone.`)) return;
    setListBusy(true);
    const { error } = await sb.from("longform_articles").delete().in("id", ids);
    setListBusy(false);
    if (error) setListMsg("Failed: " + error.message);
    else {
      try {
        ids.forEach((id) => localStorage.removeItem(draftKey(id))); // clear orphaned autosave drafts
      } catch {
        /* ignore */
      }
      afterBulk(`Deleted ${ids.length}.`);
    }
  };

  // Categorize EVERY uncategorized article (filter-predicate RPC — scales past
  // the 1000-row cap, unlike enumerating ids client-side).
  const categorizeUncategorized = async () => {
    // Use the value the select actually DISPLAYS (bulkCat can be "" if the user
    // picked "Uncategorized" in the selection bulk bar — never write that here).
    const target = bulkCat || CATEGORY_LABELS[0];
    if (!confirm(`Set ALL uncategorized articles to ${target}?`)) return;
    setListBusy(true);
    const { data, error } = await sb.rpc("bulk_set_category", { p_from: null, p_to: target });
    setListBusy(false);
    if (error) setListMsg("Failed: " + error.message);
    else afterBulk(`Categorized ${data} article(s) → ${target}.`);
  };

  const save = async (mode: "draft" | "publish" | "schedule") => {
    if (!form.title.trim()) {
      setMsg({ t: "Title is required.", ok: false });
      return;
    }
    setBusy(true);
    setMsg(null);
    // Lowercase to match the normalization slugTakenServer/isSlugTaken compare
    // against and that slugify() already applies — avoids case-variant duplicates.
    const slug = (form.slug || slugify(form.title)).trim().toLowerCase();
    const row: Record<string, unknown> = {
      title: form.title.trim(),
      slug,
      excerpt: form.excerpt.trim(),
      content: form.content,
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      category: form.category || null,
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

    // Server-side uniqueness — immune to the 1000-row list cap, so a collision
    // with an older (unloaded) article is caught before it breaks /p/<slug>.
    if (await slugTakenServer(sb, slug, form.id)) {
      setMsg({ t: "Another article already uses this slug.", ok: false });
      setBusy(false);
      return;
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
      // On a slug rename, also revalidate the OLD path so /p/<oldslug> stops serving
      // stale ISR content (it will re-render and 404 since the row moved).
      if (form.id && origSlugRef.current && origSlugRef.current !== slug) await revalidate(origSlugRef.current);
      await logActivity(sb, mode, "article", savedId, form.title.trim());
      clearDraft(); // clears the key for the slot we saved under (form.id here)
      setDirty(false);
      setMsg({ t: "Saved.", ok: true });
      setSlugLocked(true);
      origSlugRef.current = slug; // a later rename in the same session revalidates from here
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
    if (!error) {
      await revalidate(slug);
      await logActivity(sb, "delete", "article", id, slug);
      try {
        localStorage.removeItem(draftKey(id)); // don't leave an orphaned autosave draft
      } catch {
        /* ignore */
      }
      if (form.id === id) setEditing(false);
      loadList();
    }
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

  // ---- Editor toolbar: wrap/insert markdown around the textarea selection ----
  const surround = (pre: string, post: string) => {
    const ta = contentRef.current;
    if (!ta) return;
    const s = ta.selectionStart ?? 0;
    const e = ta.selectionEnd ?? 0;
    const val = form.content;
    set("content", val.slice(0, s) + pre + val.slice(s, e) + post + val.slice(e));
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = s + pre.length;
      ta.selectionEnd = e + pre.length;
    });
  };
  const prefixLine = (pre: string) => {
    const ta = contentRef.current;
    if (!ta) return;
    const s = ta.selectionStart ?? 0;
    const val = form.content;
    const lineStart = val.lastIndexOf("\n", s - 1) + 1;
    set("content", val.slice(0, lineStart) + pre + val.slice(lineStart));
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = s + pre.length;
    });
  };
  const insertText = (text: string) => {
    const ta = contentRef.current;
    if (!ta) return; // no-op in preview mode, matching surround/prefixLine
    const s = ta.selectionStart ?? form.content.length;
    const val = form.content;
    set("content", val.slice(0, s) + text + val.slice(s));
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = s + text.length;
    });
  };
  const onContentKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === "b") {
        e.preventDefault();
        surround("**", "**");
      } else if (k === "i") {
        e.preventDefault();
        surround("*", "*");
      } else if (k === "k") {
        e.preventDefault();
        surround("[", "](url)");
      }
    }
  };
  const duplicate = () => {
    skipPersist.current = true;
    setForm((f) => ({ ...f, id: "", title: (f.title || "").trim() + " (copy)", slug: "", scheduled: "" }));
    setSlugLocked(false);
    setReviewUrl("");
    setLoadedStatus("new");
    setDirty(true);
    setMsg({ t: "Duplicated as a new draft — edit and Save to create it.", ok: true });
  };

  const openHistory = async () => {
    if (!form.id) return;
    setHistoryBusy(true);
    setViewVer(null);
    try {
      const { data, error } = await sb.rpc("list_article_versions", { p_article_id: form.id });
      if (error) throw error;
      setVersions((data || []) as typeof versions);
      setHistoryOpen(true);
    } catch (e) {
      setMsg({ t: "History failed: " + (e as Error).message, ok: false });
    } finally {
      setHistoryBusy(false);
    }
  };

  const viewVersion = async (id: string) => {
    setHistoryBusy(true);
    try {
      const { data, error } = await sb.rpc("get_article_version", { p_version_id: id });
      if (error) throw error;
      setViewVer((data?.[0] as typeof viewVer) || null);
    } catch (e) {
      setMsg({ t: "Load version failed: " + (e as Error).message, ok: false });
    } finally {
      setHistoryBusy(false);
    }
  };

  // Load a snapshot's fields into the editor WITHOUT saving — the author reviews
  // then Saves (which snapshots current state first, so restore is reversible).
  // Snapshots only store title/content/excerpt/tags, so other fields are untouched.
  const restoreVersion = () => {
    if (!viewVer) return;
    skipPersist.current = true;
    setForm((f) => ({
      ...f,
      title: viewVer.title || "",
      content: viewVer.content || "",
      excerpt: viewVer.excerpt || "",
      tags: (viewVer.tags || []).join(", "),
    }));
    setDirty(true);
    setHistoryOpen(false);
    setViewVer(null);
    setMsg({
      t: `Version ${viewVer.version_number} loaded — review, then Save to keep it. (Category, slug, series and TL;DR are unchanged — snapshots don't store them.)`,
      ok: true,
    });
  };

  if (!editing) {
    const totalPages = Math.max(1, Math.ceil(count / ADMIN_PAGE_SIZE));
    return (
      <div>
        <div className="adm-h">Articles</div>
        <div className="adm-sub">
          {count.toLocaleString()} total{listBusy ? " · loading…" : ""} — click to edit.
        </div>
        <div className="adm-actions" style={{ marginBottom: 12 }}>
          <button className="adm-btn primary" onClick={startNew}>
            + New article
          </button>
        </div>
        <div className="adm-row" style={{ marginBottom: 12 }}>
          <input
            className="adm-input"
            placeholder="Search title / body…"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
          />
          <select
            className="adm-select"
            value={status}
            onChange={(e) => {
              setPage(0);
              setStatus(e.target.value as AdminStatus);
            }}
          >
            <option value="all">All statuses</option>
            <option value="published">Live</option>
            <option value="draft">Draft</option>
            <option value="scheduled">Scheduled</option>
          </select>
          <select
            className="adm-select"
            value={catFilter}
            onChange={(e) => {
              setPage(0);
              setCatFilter(e.target.value);
            }}
          >
            <option value="">All categories</option>
            {CATEGORY_LABELS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            <option value={UNCATEGORIZED}>Uncategorized</option>
          </select>
        </div>
        {(selected.size > 0 || catFilter === UNCATEGORIZED) && (
          <div className="adm-card" style={{ padding: 12, marginBottom: 12 }}>
            <div className="adm-actions" style={{ marginTop: 0 }}>
              <label className="adm-check" style={{ cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={list.length > 0 && list.every((a) => selected.has(a.id))}
                  onChange={toggleSelAll}
                />
                Select page
              </label>
              {selected.size > 0 && (
                <>
                  <span className="adm-sub" style={{ margin: 0 }}>
                    {selected.size} selected
                  </span>
                  <button className="adm-btn" disabled={listBusy} onClick={() => bulkPublish(true)}>
                    Publish
                  </button>
                  <button className="adm-btn" disabled={listBusy} onClick={() => bulkPublish(false)}>
                    Unpublish
                  </button>
                  <select
                    className="adm-select"
                    style={{ maxWidth: 150 }}
                    value={bulkCat}
                    onChange={(e) => setBulkCat(e.target.value)}
                  >
                    <option value="">Uncategorized</option>
                    {CATEGORY_LABELS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <button className="adm-btn" disabled={listBusy} onClick={bulkCategory}>
                    Set category
                  </button>
                  <button className="adm-btn danger" disabled={listBusy} onClick={bulkDelete}>
                    Delete
                  </button>
                  <button className="adm-btn" disabled={listBusy} onClick={() => setSelected(new Set())}>
                    Clear
                  </button>
                </>
              )}
              {selected.size === 0 && catFilter === UNCATEGORIZED && count > 0 && (
                <>
                  <span className="adm-sub" style={{ margin: 0 }}>
                    {count.toLocaleString()} uncategorized →
                  </span>
                  <select
                    className="adm-select"
                    style={{ maxWidth: 150 }}
                    value={bulkCat || CATEGORY_LABELS[0]}
                    onChange={(e) => setBulkCat(e.target.value)}
                  >
                    {CATEGORY_LABELS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <button className="adm-btn" disabled={listBusy} onClick={categorizeUncategorized}>
                    Categorize all
                  </button>
                </>
              )}
            </div>
            {listMsg && <div className="adm-msg ok">{listMsg}</div>}
          </div>
        )}
        <div className="adm-list">
          {list.length === 0 && <div className="adm-sub">No articles match.</div>}
          {list.map((a) => (
            <div key={a.id} className="adm-list-item" onClick={() => startEdit(a.id)}>
              <input
                type="checkbox"
                checked={selected.has(a.id)}
                onClick={(e) => e.stopPropagation()}
                onChange={() => toggleSel(a.id)}
              />
              <span className="adm-list-title">{a.title}</span>
              {a.category && <span className="adm-pill">{a.category}</span>}
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
        {count > ADMIN_PAGE_SIZE && (
          <div className="adm-actions" style={{ marginTop: 16, justifyContent: "space-between" }}>
            <button
              className="adm-btn"
              disabled={page <= 0 || listBusy}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              ← Prev
            </button>
            <span className="adm-sub" style={{ margin: 0 }}>
              Page {page + 1} / {totalPages}
            </span>
            <button
              className="adm-btn"
              disabled={page + 1 >= totalPages || listBusy}
              onClick={() => setPage((p) => p + 1)}
            >
              Next →
            </button>
          </div>
        )}
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
        {form.id && (
          <span
            className={
              "adm-pill " +
              (loadedStatus === "live" ? "live" : loadedStatus === "scheduled" ? "sched" : "draft")
            }
          >
            {loadedStatus === "live"
              ? "Live"
              : loadedStatus === "scheduled"
                ? "Scheduled"
                : "Draft"}
          </span>
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
        <div className="adm-row">
          <div className="adm-field">
            <label className="adm-label">Category</label>
            <select className="adm-select" value={form.category} onChange={(e) => set("category", e.target.value)}>
              <option value="">Uncategorized</option>
              {CATEGORY_LABELS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="adm-field">
            <label className="adm-label">Excerpt</label>
            <input className="adm-input" value={form.excerpt} onChange={(e) => set("excerpt", e.target.value)} />
          </div>
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
          <label className="adm-label">Content (Markdown)</label>
          <div className="adm-actions" style={{ marginTop: 0, marginBottom: 8 }}>
            <button type="button" className="adm-btn" onClick={() => surround("**", "**")} title="Bold (Ctrl/Cmd+B)">
              <b>B</b>
            </button>
            <button type="button" className="adm-btn" onClick={() => surround("*", "*")} title="Italic (Ctrl/Cmd+I)">
              <i>I</i>
            </button>
            <button type="button" className="adm-btn" onClick={() => surround("[", "](url)")} title="Link (Ctrl/Cmd+K)">
              Link
            </button>
            <button type="button" className="adm-btn" onClick={() => surround("`", "`")} title="Inline code">
              {"</>"}
            </button>
            <button type="button" className="adm-btn" onClick={() => prefixLine("## ")} title="Heading">
              H2
            </button>
            <button type="button" className="adm-btn" onClick={() => prefixLine("> ")} title="Quote">
              &ldquo;
            </button>
            <button type="button" className="adm-btn" onClick={() => prefixLine("- ")} title="List">
              •
            </button>
            <button type="button" className="adm-btn" onClick={() => insertText("\n> [!NOTE]\n> ")} title="Callout">
              [!NOTE]
            </button>
            <button type="button" className="adm-btn" onClick={() => insertText("[^1]\n\n[^1]: ")} title="Footnote">
              [^]
            </button>
            <span className="adm-nav-spacer" />
            <button
              type="button"
              className={"adm-btn" + (previewOn ? " primary" : "")}
              onClick={() => setPreviewOn((v) => !v)}
            >
              {previewOn ? "✎ Edit" : "👁 Preview"}
            </button>
          </div>
          {previewOn ? (
            <div
              className="adm-input lb-article-body"
              style={{ minHeight: 360, height: "auto", overflow: "auto", padding: 16 }}
            >
              {previewBusy && <div className="adm-sub">Rendering…</div>}
              <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
            </div>
          ) : (
            <textarea
              ref={contentRef}
              className="adm-textarea"
              value={form.content}
              onChange={(e) => set("content", e.target.value)}
              onKeyDown={onContentKey}
            />
          )}
          <div className="adm-sub" style={{ marginTop: 6 }}>
            {(form.content.trim() ? form.content.trim().split(/\s+/).length : 0).toLocaleString()} words ·{" "}
            {form.content.length.toLocaleString()} chars · {readingTime(form.content)}
          </div>
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
              <button className="adm-btn" disabled={busy || historyBusy} onClick={openHistory}>
                🕑 History
              </button>
              <button className="adm-btn" disabled={busy} onClick={duplicate}>
                Duplicate
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
        {msg && <div className={"adm-msg " + (msg.ok ? "ok" : "err")}>{msg.t}</div>}
        {reviewUrl && (
          <div className="adm-msg ok">
            Review link (7-day): <a href={reviewUrl}>{reviewUrl}</a>
          </div>
        )}
      </div>

      {historyOpen && (
        <div className="adm-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div className="adm-label" style={{ margin: 0 }}>
              Version history ({versions.length})
            </div>
            <button
              className="adm-btn"
              onClick={() => {
                setHistoryOpen(false);
                setViewVer(null);
              }}
            >
              Close
            </button>
          </div>
          {versions.length === 0 && (
            <div className="adm-sub" style={{ marginTop: 10 }}>
              No saved versions yet.
            </div>
          )}
          <div className="adm-list" style={{ marginTop: 10 }}>
            {versions.map((v) => (
              <div key={v.id} className="adm-list-item" style={{ cursor: "default" }}>
                <span className="adm-pill">v{v.version_number}</span>
                <span className="adm-list-title" style={{ fontWeight: 400, fontSize: 13 }}>
                  {v.title || "(untitled)"}
                </span>
                <span className="adm-pill">{relTime(v.created_at)}</span>
                <button className="adm-btn" disabled={historyBusy} onClick={() => viewVersion(v.id)}>
                  View
                </button>
              </div>
            ))}
          </div>
          {viewVer && (
            <div className="adm-card" style={{ marginTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div className="adm-label" style={{ margin: 0 }}>
                  Viewing v{viewVer.version_number} · {relTime(viewVer.created_at)}
                </div>
                <button className="adm-btn primary" onClick={restoreVersion}>
                  Restore into editor
                </button>
              </div>
              <div className="adm-field" style={{ marginTop: 10 }}>
                <label className="adm-label">Title</label>
                <div className="adm-input" style={{ whiteSpace: "normal", height: "auto" }}>
                  {viewVer.title}
                </div>
              </div>
              <div className="adm-field">
                <label className="adm-label">Content (snapshot · read-only)</label>
                <textarea className="adm-textarea" readOnly value={viewVer.content || ""} style={{ minHeight: 220 }} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
