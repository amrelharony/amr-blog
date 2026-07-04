import type { Metadata } from "next";
import Link from "next/link";
import LibraryClient from "@/components/LibraryClient";

export const metadata: Metadata = {
  title: "Your library",
  description: "Your saved articles, highlights, and reading history — stored on this device.",
  alternates: { canonical: "/library" },
  robots: { index: false }, // per-reader page; nothing indexable
};

export default function LibraryPage() {
  return (
    <div className="lb-wrap" style={{ maxWidth: 900 }}>
      <nav className="lb-nav" role="navigation" aria-label="Blog navigation">
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Link className="lb-nav-back" href="/" role="link">
            <i className="fa-solid fa-arrow-left" aria-hidden="true" /> <span>Articles</span>
          </Link>
          <span className="lb-nav-sep" aria-hidden="true" />
          <a className="lb-nav-brand" href="https://amrelharony.com" role="link">
            AMR ELHARONY
          </a>
        </div>
      </nav>

      {/* Skip-link landing point (app/layout.tsx renders the link itself). */}
      <div id="main-content" tabIndex={-1} className="lb-skip-target" />

      <header className="lb-feed-header lb-reveal">
        <h1 className="lb-feed-title" style={{ fontSize: "clamp(28px, 5vw, 48px)" }}>
          <i className="fa-solid fa-book-bookmark" aria-hidden="true" style={{ marginRight: 14, opacity: 0.85 }} />
          Your library
        </h1>
        <p className="lb-feed-sub">SAVES · HIGHLIGHTS · HISTORY — ON THIS DEVICE</p>
        <div className="lb-feed-line" aria-hidden="true" />
      </header>

      <LibraryClient />
    </div>
  );
}
