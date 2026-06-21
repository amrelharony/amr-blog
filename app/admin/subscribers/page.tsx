"use client";
import { useCallback, useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/browser";
import { fmtDate } from "@/lib/format";

interface Sub {
  id: string;
  email: string;
  job_title: string | null;
  created_at: string;
  confirmed: boolean;
  unsubscribed_at: string | null;
}

export default function AdminSubscribers() {
  const sb = getBrowserClient();
  const [subs, setSubs] = useState<Sub[]>([]);
  const [domains, setDomains] = useState<{ id: string; domain: string }[]>([]);
  const [newDomain, setNewDomain] = useState("");
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    // Page past PostgREST's ~1000-row cap so the list, the counts, and the CSV
    // reflect the FULL subscriber table (an un-ranged select silently truncates).
    const PG = 1000;
    const all: Sub[] = [];
    let failed = false;
    for (let from = 0; from < 1_000_000; from += PG) {
      const { data, error } = await sb
        .from("newsletter_subscribers")
        .select("*")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false }) // stable tiebreaker for safe paging
        .range(from, from + PG - 1);
      if (error) {
        failed = true;
        break;
      }
      const rows = (data || []) as Sub[];
      all.push(...rows);
      if (rows.length < PG) break;
    }
    if (failed) {
      // Never overwrite a known-good list with a partial one — the counts and CSV
      // would silently under-report. Keep prior data and surface the error.
      setLoadError("Couldn't load the full subscriber list — click Refresh to retry.");
      return;
    }
    setLoadError("");
    const { data: d } = await sb
      .from("blocked_email_domains")
      .select("id,domain")
      .order("domain");
    setSubs(all);
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
  const exportCsv = () => {
    const header = ["email", "job_title", "confirmed", "unsubscribed", "created_at"].join(",");
    const rows = subs.map((s) =>
      [s.email, s.job_title || "", s.confirmed, !!s.unsubscribed_at, s.created_at].map(csvCell).join(","),
    );
    const blob = new Blob([[header, ...rows].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "subscribers.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

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

  return (
    <div>
      <div className="adm-h">Subscribers</div>
      <div className="adm-sub">
        {confirmed.length} confirmed · {subs.length} total
      </div>
      <div className="adm-actions" style={{ marginBottom: 16 }}>
        <button className="adm-btn" onClick={exportCsv} disabled={!subs.length || !!loadError}>
          ⬇ Export CSV
        </button>
        <button className="adm-btn" onClick={load}>
          ↻ Refresh
        </button>
      </div>
      {loadError && <div className="adm-msg err" style={{ marginBottom: 16 }}>{loadError}</div>}

      <div className="adm-list" style={{ marginBottom: 24 }}>
        {subs.length === 0 && <div className="adm-sub">No subscribers yet.</div>}
        {subs.map((s) => (
          <div key={s.id} className="adm-list-item" style={{ cursor: "default" }}>
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
