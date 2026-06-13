"use client";
import { useEffect } from "react";

// Admin-scoped error boundary (mirrors app/error.tsx but styled with .adm-*).
// Catches thrown errors in admin pages — e.g. a Supabase query failing.
export default function AdminError({
  error,
  unstable_retry,
  reset,
}: {
  error: Error & { digest?: string };
  unstable_retry?: () => void;
  reset?: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const retry = unstable_retry ?? reset;

  return (
    <div className="adm-card" style={{ textAlign: "center", marginTop: 24 }}>
      <div className="adm-h">Something broke</div>
      <div className="adm-sub">An admin query or action failed. Trying again usually fixes it.</div>
      <div className="adm-actions" style={{ justifyContent: "center" }}>
        {retry && (
          <button className="adm-btn primary" onClick={() => retry()}>
            Try again
          </button>
        )}
        {/* Full navigation is the safe reset from a broken tree. */}
        <a className="adm-btn" href="/admin">
          Dashboard
        </a>
      </div>
      {error.digest && (
        <div className="adm-sub" style={{ marginTop: 10, fontFamily: "'JetBrains Mono',monospace" }}>
          ref: {error.digest}
        </div>
      )}
    </div>
  );
}
