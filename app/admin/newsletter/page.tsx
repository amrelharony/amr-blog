"use client";
import { useCallback, useEffect, useState } from "react";
import { fmtDate } from "@/lib/format";

interface Log {
  id: string;
  sent_at: string;
  status: string;
  article_count: number;
  recipient_count: number;
  batch_remaining: number;
  articles_since: string;
}
interface Preview {
  html: string;
  articleCount: number;
  subscriberCount: number;
  since: string;
}

export default function AdminNewsletter() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/newsletter");
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      setLogs(d.logs || []);
      setPreview(d.preview || null);
    } catch (e) {
      setMsg({ t: "Load failed: " + (e as Error).message, ok: false });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const sendNow = async () => {
    if (!confirm(`Send the digest now to ${preview?.subscriberCount ?? 0} confirmed subscriber(s)? This emails real people.`))
      return;
    setSending(true);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/newsletter", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      if (d.skipped) setMsg({ t: `Skipped: ${d.reason}`, ok: true });
      else
        setMsg({
          t: `Sent to ${d.sent}/${d.totalSubscribers}. ${d.remaining ? d.remaining + " remaining — the cron continues the batch." : "Complete."}`,
          ok: true,
        });
      load();
    } catch (e) {
      setMsg({ t: "Send failed: " + (e as Error).message, ok: false });
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <div className="adm-h">Newsletter</div>
      <div className="adm-sub">Biweekly digest — preview, send, and history.</div>

      <div className="adm-card">
        <div className="adm-label">Next digest</div>
        {loading ? (
          <div className="adm-sub" style={{ marginTop: 8 }}>
            Loading…
          </div>
        ) : (
          <>
            <div className="adm-grid" style={{ marginTop: 12 }}>
              <div className="adm-stat">
                <div className="adm-stat-num">{preview?.articleCount ?? 0}</div>
                <div className="adm-stat-label">New articles</div>
              </div>
              <div className="adm-stat">
                <div className="adm-stat-num">{preview?.subscriberCount ?? 0}</div>
                <div className="adm-stat-label">Confirmed subscribers</div>
              </div>
            </div>
            <div className="adm-actions">
              <button
                className="adm-btn primary"
                disabled={sending || !preview?.articleCount || !preview?.subscriberCount}
                onClick={sendNow}
              >
                {sending ? "Sending…" : "Send now"}
              </button>
              <button className="adm-btn" disabled={loading || sending} onClick={load}>
                Refresh
              </button>
            </div>
            {!preview?.articleCount && (
              <div className="adm-sub" style={{ marginTop: 8 }}>
                No new articles since the last send — nothing to send.
              </div>
            )}
            {msg && <div className={"adm-msg " + (msg.ok ? "ok" : "err")}>{msg.t}</div>}
            {preview?.html && (
              <div style={{ marginTop: 14 }}>
                <div className="adm-label">Preview</div>
                <iframe
                  title="Newsletter preview"
                  srcDoc={preview.html}
                  style={{
                    width: "100%",
                    height: 520,
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    marginTop: 8,
                    background: "#06080f",
                  }}
                />
              </div>
            )}
          </>
        )}
      </div>

      <div className="adm-card">
        <div className="adm-label">Send history ({logs.length})</div>
        {logs.length === 0 && (
          <div className="adm-sub" style={{ marginTop: 8 }}>
            No sends yet.
          </div>
        )}
        <div className="adm-list" style={{ marginTop: 10 }}>
          {logs.map((l) => (
            <div key={l.id} className="adm-list-item" style={{ cursor: "default" }}>
              <span className="adm-pill">{fmtDate(l.sent_at)}</span>
              <span className="adm-list-title" style={{ fontWeight: 400, fontSize: 13 }}>
                {l.article_count} article{l.article_count !== 1 ? "s" : ""} · {l.recipient_count} recipient
                {l.recipient_count !== 1 ? "s" : ""}
              </span>
              {l.batch_remaining > 0 && <span className="adm-pill sched">{l.batch_remaining} remaining</span>}
              <span
                className={
                  "adm-pill " +
                  (l.status === "sent" ? "live" : l.status === "pending" || l.status === "in_progress" ? "sched" : "draft")
                }
              >
                {l.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
