import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

export default function NotFound() {
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
      <div className="lb-empty" role="status" style={{ padding: "8rem 1rem" }}>
        <div className="lb-empty-icon">🧭</div>
        404 — this page doesn&apos;t exist (or was unpublished).
        <br />
        <Link href="/" style={{ color: "var(--accent)" }}>
          Back to all articles
        </Link>
      </div>
    </div>
  );
}
