import type { Metadata } from "next";
import Link from "next/link";

// Root not-found: triggered by notFound() (e.g. unknown /p/[slug]) and any
// unmatched URL. Renders inside the root layout, so theme/particles/controls
// all keep working. Next.js injects <meta name="robots" content="noindex">
// for 404 responses automatically.
export const metadata: Metadata = { title: "Not found" };

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

      <main>
        <div className="lb-empty" role="status">
          <div className="lb-empty-icon">🛰️</div>
          404 — this page drifted off the feed.
          <br />
          It may have been unpublished, renamed, or never existed.
          <div className="lb-empty-actions">
            <Link className="lb-tag-chip" href="/">
              ← All articles
            </Link>
            <Link className="lb-tag-chip" href="/thoughts">
              Thoughts
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
