"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase/browser";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const { error } = await getBrowserClient().auth.signInWithPassword({ email, password });
    if (error) {
      setErr(error.message);
      setBusy(false);
      return;
    }
    router.push("/admin");
    router.refresh();
  };

  return (
    <form className="adm-login adm-card" onSubmit={submit}>
      <div className="adm-h">Admin sign-in</div>
      <div className="adm-sub">Restricted area.</div>
      <div className="adm-field">
        <label className="adm-label">Email</label>
        <input
          className="adm-input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          required
        />
      </div>
      <div className="adm-field">
        <label className="adm-label">Password</label>
        <input
          className="adm-input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </div>
      <div className="adm-actions">
        <button className="adm-btn primary" type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </div>
      {err && <div className="adm-msg err">{err}</div>}
    </form>
  );
}
