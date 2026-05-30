"use client";
import { useState } from "react";
import { getBrowserClient } from "@/lib/supabase/browser";

// Newsletter double-opt-in signup: subscribe_newsletter RPC → POST /api/newsletter/confirm
// (sends the confirmation email via Resend). Corporate-email + job-title enforced server-side.
export default function NewsletterSignup() {
  const sb = getBrowserClient();
  const [email, setEmail] = useState("");
  const [job, setJob] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ t: string; err: boolean } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const { data, error } = await sb.rpc("subscribe_newsletter", {
        p_email: email.trim(),
        p_job_title: job.trim(),
        p_phone: phone.trim() || null,
      });
      if (error) throw error;
      if (!data) {
        setStatus({ t: "You're already subscribed. 🎉", err: false });
        return;
      }
      await fetch("/api/newsletter/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), token: data }),
      });
      setStatus({ t: "Almost there — check your inbox to confirm. 📬", err: false });
      setEmail("");
      setJob("");
      setPhone("");
    } catch (err) {
      setStatus({ t: (err as Error).message || "Subscription failed.", err: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lb-newsletter lb-reveal">
      <div className="lb-newsletter-icon">📬</div>
      <div className="lb-newsletter-title">Biweekly Digest</div>
      <div className="lb-newsletter-sub">
        New articles on Agile, FinTech &amp; Digital Transformation — straight to your inbox. Corporate email required.
      </div>
      <form className="lb-newsletter-form" onSubmit={submit}>
        <input type="email" required placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <div className="lb-newsletter-fields">
          <input type="text" required placeholder="Job title" value={job} onChange={(e) => setJob(e.target.value)} />
          <input type="tel" placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <button type="submit" disabled={busy}>
          {busy ? "…" : "Subscribe"}
        </button>
      </form>
      {status && <div className={"lb-newsletter-status visible" + (status.err ? " error" : "")}>{status.t}</div>}
    </div>
  );
}
