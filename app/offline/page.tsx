import type { Metadata } from "next";
import Link from "next/link";

// Offline fallback served by public/sw.js when a navigation fails and the page
// isn't in any cache. Static — precached at SW install.
export const metadata: Metadata = {
  title: "Offline",
  robots: { index: false },
};

export default function OfflinePage() {
  return (
    <div className="lb-wrap" style={{ maxWidth: 640, textAlign: "center", paddingTop: 80 }}>
      <div style={{ fontSize: 56, marginBottom: 18 }} aria-hidden="true">
        📡
      </div>
      <h1 className="lb-feed-title" style={{ fontSize: "clamp(24px, 5vw, 36px)" }}>
        You’re offline
      </h1>
      <p style={{ color: "var(--sub, #94a3b8)", lineHeight: 1.7, margin: "16px 0 28px" }}>
        This page isn’t available without a connection. Articles you saved to a reading
        list with the 🔖 button are stored for offline reading — find them in your library
        once you’re back online, or retry below.
      </p>
      <p>
        <Link
          href="/"
          className="lb-nav-back"
          style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
        >
          <i className="fa-solid fa-rotate-right" aria-hidden="true" /> Try again
        </Link>
      </p>
    </div>
  );
}
