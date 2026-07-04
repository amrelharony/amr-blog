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
  const [frequency, setFrequency] = useState<"digest" | "instant">("digest");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ t: string; err: boolean } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      // v2 wraps the original subscribe_newsletter and records the frequency
      // choice (db/migrations/0013). Fall back to v1 until it's applied.
      let { data, error } = await sb.rpc("subscribe_newsletter_v2", {
        p_email: email.trim(),
        p_job_title: job.trim(),
        p_phone: phone.trim() || null,
        p_frequency: frequency,
      });
      if (error && /subscribe_newsletter_v2/i.test(error.message || "")) {
        ({ data, error } = await sb.rpc("subscribe_newsletter", {
          p_email: email.trim(),
          p_job_title: job.trim(),
          p_phone: phone.trim() || null,
        }));
      }
      if (error) throw error;
      if (!data) {
        setStatus({ t: "You're already subscribed. 🎉", err: false });
        return;
      }
      const confirmRes = await fetch("/api/newsletter/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), token: data }),
      });
      // fetch only rejects on a network error, not on 4xx/5xx — check the status so a
      // failed send (e.g. Resend down) shows an error instead of a false "check your inbox".
      if (!confirmRes.ok) throw new Error("Couldn't send the confirmation email. Please try again in a moment.");
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
        <fieldset className="lb-newsletter-freq">
          <legend className="lb-visually-hidden">Email frequency</legend>
          <label>
            <input
              type="radio"
              name="nl-frequency"
              checked={frequency === "digest"}
              onChange={() => setFrequency("digest")}
            />
            📬 Biweekly digest
          </label>
          <label>
            <input
              type="radio"
              name="nl-frequency"
              checked={frequency === "instant"}
              onChange={() => setFrequency("instant")}
            />
            ⚡ Every new article
          </label>
        </fieldset>
        <button type="submit" disabled={busy}>
          {busy ? "…" : "Subscribe"}
        </button>
      </form>
      {status && <div className={"lb-newsletter-status visible" + (status.err ? " error" : "")}>{status.t}</div>}
    </div>
  );
}
