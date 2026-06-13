"use client";

// Last-resort boundary: replaces the root layout when it (or the app shell)
// throws, so it must render its own <html>/<body> and can't use blog.css —
// the layout's CSS imports are gone at this point. Inline styles hardcode the
// dark-theme tokens from app/globals.css (--bg #06080f, --text #f0f2f5,
// --accent #00e1ff). metadata exports aren't supported here; React's <title>
// covers the tab label.
export default function GlobalError({
  error,
  unstable_retry,
  reset,
}: {
  error: Error & { digest?: string };
  unstable_retry?: () => void;
  reset?: () => void;
}) {
  const retry = unstable_retry ?? reset ?? (() => window.location.reload());

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#06080f",
          color: "#f0f2f5",
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          textAlign: "center",
        }}
      >
        <title>Something went wrong</title>
        <div style={{ padding: 24 }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
          <div style={{ fontSize: 14, letterSpacing: 1 }}>SOMETHING WENT WRONG</div>
          <p style={{ fontSize: 12, color: "#8a95a8", margin: "12px 0 20px" }}>
            The page failed to render. Reloading usually fixes it.
          </p>
          <button
            onClick={() => retry()}
            style={{
              background: "transparent",
              border: "1px solid #00e1ff",
              color: "#00e1ff",
              borderRadius: 8,
              padding: "10px 22px",
              fontFamily: "inherit",
              fontSize: 11,
              letterSpacing: 2,
              cursor: "pointer",
            }}
          >
            RELOAD
          </button>
          {error?.digest && (
            <p style={{ fontSize: 10, color: "#8a95a8", marginTop: 18 }}>ref: {error.digest}</p>
          )}
        </div>
      </body>
    </html>
  );
}
