"use client";
import { useEffect } from "react";

// Route error boundary — the user-facing net for thrown data errors (e.g. the
// `throw error` paths in lib/queries/* during a Supabase outage). Next 16.2
// passes `unstable_retry` (re-fetches and re-renders the segment); `reset` is
// the older clear-state-only fallback, kept for safety.
export default function Error({
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
    <div className="lb-wrap" style={{ maxWidth: 900 }}>
      <main>
        <div className="lb-empty" role="alert">
          <div className="lb-empty-icon">⚠️</div>
          Something broke while loading this page.
          <br />
          It&apos;s probably temporary — trying again usually fixes it.
          <div className="lb-empty-actions">
            {retry && (
              <button className="lb-tag-chip" onClick={() => retry()}>
                ↻ Try again
              </button>
            )}
            {/* Full navigation on purpose: a fresh document load is the most
                reliable escape from a broken client tree. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a className="lb-tag-chip" href="/">
              ← Go home
            </a>
          </div>
          {error.digest && <div className="lb-error-digest">ref: {error.digest}</div>}
        </div>
      </main>
    </div>
  );
}
