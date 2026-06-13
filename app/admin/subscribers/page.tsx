"use client";
import { useCallback, useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/browser";
import { fmtDate } from "@/lib/format";
import { filterSort } from "@/lib/admin-filter";
import { toast } from "@/lib/toast";
import AdminListToolbar from "@/components/AdminListToolbar";

interface Sub {
  id: string;
  email: string;
  job_title: string | null;
  created_at: string;
  confirmed: boolean;
  unsubscribed_at: string | null;
}

const subStatus = (s: Sub) => (s.unsubscribed_at ? "unsub" : s.confirmed ? "confirmed" : "pending");
const S_COMPARATORS: Record<string, (a: Sub, b: Sub) => number> = {
  newest: (a, b) => b.created_at.localeCompare(a.created_at),
  oldest: (a, b) => a.created_at.localeCompare(b.created_at),
  email: (a, b) => a.email.localeCompare(b.email),
};
const S_STATUS = [
  { value: "all", label: "All" },
  { value: "confirmed", label: "Confirmed" },
  { value: "pending", label: "Pending" },
  { value: "unsub", label: "Unsubscribed" },
];
const S_SORT = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "email", label: "Email A–Z" },
];

export default function AdminSubscribers() {
  const sb = getBrowserClient();
  const [subs, setSubs] = useState<Sub[]>([]);
  const [domains, setDomains] = useState<{ id: string; domain: string }[]>([]);
  const [newDomain, setNewDomain] = useState("");
  const [query, setQuery] = useState("");
  const [statusF, setStatusF] = useState("all");
  const [sortF, setSortF] = useState("newest");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const [{ data: s }, { data: d }] = await Promise.all([
      sb.from("newsletter_subscribers").select("*").order("created_at", { ascending: false }),
      sb.from("blocked_email_domains").select("id,domain").order("domain"),
    ]);
    setSubs((s || []) as Sub[]);
    setDomains((d || []) as { id: string; domain: string }[]);
  }, [sb]);
  useEffect(() => {
    load();
  }, [load]);

  const confirmed = subs.filter((s) => s.confirmed && !s.unsubscribed_at);

  // Quote every field and neutralise spreadsheet formula injection (leading = + - @ tab),
  // since email/job_title are visitor-supplied.
  const csvCell = (v: unknown) => {
    let s = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const downloadCsv = (list: Sub[], name: string) => {
    const header = ["email", "job_title", "confirmed", "unsubscribed", "created_at"].join(",");
    const rows = list.map((s) =>
      [s.email, s.job_title || "", s.confirmed, !!s.unsubscribed_at, s.created_at].map(csvCell).join(","),
    );
    const blob = new Blob([[header, ...rows].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const exportCsv = () => downloadCsv(subs, "subscribers.csv");

  const addDomain = async () => {
    const d = newDomain.trim().toLowerCase();
    if (!d) return;
    await sb.from("blocked_email_domains").insert({ domain: d });
    setNewDomain("");
    load();
  };
  const removeDomain = async (id: string) => {
    await sb.from("blocked_email_domains").delete().eq("id", id);
    load();
  };

  const visible = filterSort(subs, {
    query,
    fields: (s) => [s.email, s.job_title],
    status: statusF,
    statusOf: subStatus,
    sort: sortF,
    comparators: S_COMPARATORS,
  });
  const selectedVisible = visible.reduce((n, s) => n + (selected.has(s.id) ? 1 : 0), 0);
  const allSelected = visible.length > 0 && visible.every((s) => selected.has(s.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(visible.map((s) => s.id)));
  const toggleOne = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const bulkExport = () => downloadCsv(visible.filter((s) => selected.has(s.id)), "subscribers-selection.csv");
  const bulkDelete = async () => {
    const targets = visible.filter((s) => selected.has(s.id));
    if (!targets.length || !confirm(`Delete ${targets.length} subscriber(s)?`)) return;
    const ids = new Set(targets.map((s) => s.id));
    setSubs((p) => p.filter((s) => !ids.has(s.id))); // optimistic
    setSelected(new Set());
    const failed: Sub[] = [];
    for (const s of targets) {
      const { error } = await sb.from("newsletter_subscribers").delete().eq("id", s.id);
      if (error) failed.push(s);
    }
    if (failed.length) {
      setSubs((p) => [...failed, ...p].sort((a, b) => b.created_at.localeCompare(a.created_at)));
      toast.err(
        failed.length === targets.length
          ? "Deleting subscribers isn't permitted — use Export instead."
          : `${failed.length} couldn't be deleted.`,
      );
    }
    const ok = targets.length - failed.length;
    if (ok) toast.ok(`Deleted ${ok} subscriber${ok > 1 ? "s" : ""}.`);
  };

  return (
    <div>
      <div className="adm-h">Subscribers</div>
      <div className="adm-sub">
        {confirmed.length} confirmed · {visible.length} of {subs.length} total
      </div>
      <div className="adm-actions" style={{ marginBottom: 16 }}>
        <button className="adm-btn" onClick={exportCsv} disabled={!subs.length}>
          ⬇ Export all CSV
        </button>
      </div>
      <AdminListToolbar
        query={query}
        onQuery={setQuery}
        placeholder="Search email or job title…"
        status={statusF}
        onStatus={setStatusF}
        statusOptions={S_STATUS}
        sort={sortF}
        onSort={setSortF}
        sortOptions={S_SORT}
        selectable
        allSelected={allSelected}
        onToggleAll={toggleAll}
        selectedCount={selectedVisible}
        onBulkExport={bulkExport}
        bulkExportLabel="Export selection"
        onBulkDelete={bulkDelete}
        bulkDeleteLabel="Delete selected"
        onClearSelection={() => setSelected(new Set())}
      />

      <div className="adm-list" style={{ marginBottom: 24 }}>
        {visible.length === 0 && <div className="adm-sub">No subscribers match.</div>}
        {visible.map((s) => (
          <div key={s.id} className="adm-list-item" style={{ cursor: "default" }}>
            <input
              type="checkbox"
              className="adm-rowcheck"
              checked={selected.has(s.id)}
              onChange={() => toggleOne(s.id)}
              aria-label={`Select ${s.email}`}
            />
            <span className="adm-list-title" style={{ fontWeight: 400, fontSize: 13 }}>
              {s.email}
            </span>
            {s.job_title && <span className="adm-pill">{s.job_title}</span>}
            <span className="adm-pill">{fmtDate(s.created_at)}</span>
            {s.unsubscribed_at ? (
              <span className="adm-pill draft">Unsubscribed</span>
            ) : s.confirmed ? (
              <span className="adm-pill live">Confirmed</span>
            ) : (
              <span className="adm-pill sched">Pending</span>
            )}
          </div>
        ))}
      </div>

      <div className="adm-card">
        <div className="adm-label">Blocked email domains ({domains.length})</div>
        <div className="adm-actions" style={{ marginTop: 8 }}>
          <input
            className="adm-input"
            style={{ maxWidth: 240 }}
            placeholder="gmail.com"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
          />
          <button className="adm-btn" onClick={addDomain}>
            Block
          </button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
          {domains.map((d) => (
            <span key={d.id} className="adm-pill" style={{ cursor: "pointer" }} onClick={() => removeDomain(d.id)} title="Click to remove">
              {d.domain} ✕
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
