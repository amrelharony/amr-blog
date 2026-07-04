import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import SearchPageClient from "@/components/SearchPageClient";

export const metadata: Metadata = {
  title: "Search",
  description: "Full-text search across every article and thought.",
  alternates: { canonical: "/search" },
  robots: { index: true, follow: true },
};

export default function SearchPage() {
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
          <i className="fa-solid fa-magnifying-glass" aria-hidden="true" style={{ marginRight: 14, opacity: 0.85 }} />
          Search
        </h1>
        <div className="lb-feed-line" aria-hidden="true" />
      </header>

      {/* useSearchParams (inside the client) requires a Suspense boundary. */}
      <Suspense fallback={null}>
        <SearchPageClient />
      </Suspense>
    </div>
  );
}
