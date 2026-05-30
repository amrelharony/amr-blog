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

  const exportCsv = () => {
    const header = "email,job_title,confirmed,unsubscribed,created_at\n";
    const body = subs
      .map((s) =>
        [s.email, (s.job_title || "").replace(/,/g, " "), s.confirmed, !!s.unsubscribed_at, s.created_at].join(","),
      )
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
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
        <button className="adm-btn" onClick={exportCsv} disabled={!subs.length}>
          ⬇ Export CSV
        </button>
      </div>

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
