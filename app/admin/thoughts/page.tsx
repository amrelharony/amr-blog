"use client";
import { useCallback, useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/browser";
import { relTime } from "@/lib/microblog-format";
import { toLocalInput } from "@/lib/format";
import { filterSort, pubStatus } from "@/lib/admin-filter";
import { toast } from "@/lib/toast";
import AdminListToolbar from "@/components/AdminListToolbar";
import type { Thought, Poll } from "@/lib/types";

const MAX = 500;

const T_COMPARATORS: Record<string, (a: Thought, b: Thought) => number> = {
  pinned: (a, b) => (a.pinned === b.pinned ? 0 : a.pinned ? -1 : 1) || b.created_at.localeCompare(a.created_at),
  newest: (a, b) => b.created_at.localeCompare(a.created_at),
  oldest: (a, b) => a.created_at.localeCompare(b.created_at),
};
const T_STATUS = [
  { value: "all", label: "All" },
  { value: "live", label: "Live" },
  { value: "draft", label: "Draft" },
  { value: "sched", label: "Scheduled" },
];
const T_SORT = [
  { value: "pinned", label: "Pinned first" },
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
];

export default function AdminThoughts() {
  const sb = getBrowserClient();
  const [list, setList] = useState<Thought[]>([]);
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [scheduled, setScheduled] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [query, setQuery] = useState("");
  const [statusF, setStatusF] = useState("all");
  const [sortF, setSortF] = useState("pinned");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Edit mode: when set, the form updates an existing thought instead of inserting.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPoll, setEditPoll] = useState<Poll | null>(null);
  const [editImage, setEditImage] = useState<string | null>(null);

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
      const row: Record<string, unknown> = { content: content.trim(), published: mode === "publish", linkedin_posted: true };
      if (image_url) row.image_url = image_url;
      else if (editingId && editImage) row.image_url = editImage; // preserve existing image
      // [poll:Question?|Option 1|Option 2]
      const pollMatch = content.match(/\[poll:(.+?)\|(.+?)\]/);
      if (pollMatch) {
        row.poll = {
          question: pollMatch[1].trim(),
          options: pollMatch[2].split("|").map((o) => ({ text: o.trim(), votes: 0 })),
        };
        row.content = content.replace(/\[poll:.+?\]/, "").trim() || pollMatch[1].trim();
      } else if (editingId && editPoll) {
        row.poll = editPoll; // preserve the existing poll + its votes when editing
      }
      if (mode === "schedule") {
        if (!scheduled) {
          setMsg({ t: "Pick a schedule date.", ok: false });
          setBusy(false);
          return;
        }
        row.published = false;
        row.scheduled_at = new Date(scheduled).toISOString();
      } else if (editingId) {
        row.scheduled_at = null; // editing back to draft/publish clears any prior schedule
      }
      const { error } = editingId
        ? await sb.from("microblog").update(row).eq("id", editingId)
        : await sb.from("microblog").insert(row);
      if (error) throw error;
      const wasEditing = !!editingId;
      setContent("");
      setFile(null);
      setScheduled("");
      setEditingId(null);
      setEditPoll(null);
      setEditImage(null);
      setMsg({ t: wasEditing ? "Updated." : "Posted.", ok: true });
      toast.ok(wasEditing ? "Thought updated." : "Thought posted.");
      await revalidate();
      load();
    } catch (e) {
      setMsg({ t: "Failed: " + (e as Error).message, ok: false });
    } finally {
      setBusy(false);
    }
  };

  const startEditThought = (t: Thought) => {
    setEditingId(t.id);
    setContent(t.content || "");
    setEditPoll(t.poll || null);
    setEditImage(t.image_url || null);
    setFile(null);
    setScheduled(toLocalInput(t.scheduled_at));
    setMsg({ t: "Editing — Post/Save/Schedule will update this thought.", ok: true });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditPoll(null);
    setEditImage(null);
    setContent("");
    setFile(null);
    setScheduled("");
    setMsg(null);
  };

  const togglePin = async (t: Thought) => {
    setList((p) => p.map((x) => (x.id === t.id ? { ...x, pinned: !x.pinned } : x))); // optimistic
    const { error } = await sb.from("microblog").update({ pinned: !t.pinned }).eq("id", t.id);
    if (error) {
      setList((p) => p.map((x) => (x.id === t.id ? { ...x, pinned: t.pinned } : x)));
      toast.err("Couldn't update.");
      return;
    }
    toast.ok(t.pinned ? "Unpinned." : "Pinned.");
    revalidate();
  };
  const del = async (id: string) => {
    if (!confirm("Delete this thought?")) return;
    const prev = list;
    setList((p) => p.filter((t) => t.id !== id)); // optimistic
    const { error } = await sb.from("microblog").delete().eq("id", id);
    if (error) {
      setList(prev);
      toast.err("Couldn't delete.");
      return;
    }
    toast.ok("Deleted.");
    revalidate();
  };

  const visible = filterSort(list, {
    query,
    fields: (t) => [t.content],
    status: statusF,
    statusOf: pubStatus,
    sort: sortF,
    comparators: T_COMPARATORS,
  });
  const selectedVisible = visible.reduce((n, t) => n + (selected.has(t.id) ? 1 : 0), 0);
  const allSelected = visible.length > 0 && visible.every((t) => selected.has(t.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(visible.map((t) => t.id)));
  const toggleOne = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const bulkDelete = async () => {
    const targets = visible.filter((t) => selected.has(t.id));
    if (!targets.length || !confirm(`Delete ${targets.length} thought(s)?`)) return;
    const ids = new Set(targets.map((t) => t.id));
    setList((p) => p.filter((t) => !ids.has(t.id))); // optimistic
    setSelected(new Set());
    const failed: Thought[] = [];
    for (const t of targets) {
      const { error } = await sb.from("microblog").delete().eq("id", t.id);
      if (error) failed.push(t);
    }
    if (failed.length) {
      setList((p) => [...p, ...failed]);
      toast.err(`${failed.length} couldn't be deleted.`);
    }
    const ok = targets.length - failed.length;
    if (ok) {
      toast.ok(`Deleted ${ok} thought${ok > 1 ? "s" : ""}.`);
      revalidate();
    }
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
            {editingId ? "Update" : "Post"}
          </button>
          <button className="adm-btn" disabled={busy} onClick={() => post("draft")}>
            {editingId ? "Update as draft" : "Save draft"}
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
          {editingId && (
            <button className="adm-btn" disabled={busy} onClick={cancelEdit}>
              Cancel edit
            </button>
          )}
        </div>
        {msg && <div className={"adm-msg " + (msg.ok ? "ok" : "err")}>{msg.t}</div>}
      </div>

      <div className="adm-sub">
        {visible.length} of {list.length} thoughts
      </div>
      <AdminListToolbar
        query={query}
        onQuery={setQuery}
        placeholder="Search content…"
        status={statusF}
        onStatus={setStatusF}
        statusOptions={T_STATUS}
        sort={sortF}
        onSort={setSortF}
        sortOptions={T_SORT}
        selectable
        allSelected={allSelected}
        onToggleAll={toggleAll}
        selectedCount={selectedVisible}
        onBulkDelete={bulkDelete}
        bulkDeleteLabel="Delete selected"
        onClearSelection={() => setSelected(new Set())}
      />
      <div className="adm-list">
        {visible.map((t) => (
          <div key={t.id} className="adm-list-item">
            <input
              type="checkbox"
              className="adm-rowcheck"
              checked={selected.has(t.id)}
              onChange={() => toggleOne(t.id)}
              aria-label="Select thought"
            />
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
            <button className="adm-btn" onClick={() => startEditThought(t)}>
              Edit
            </button>
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
