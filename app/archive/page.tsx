import type { Metadata } from "next";
import Link from "next/link";
import { getAllPublishedForArchive } from "@/lib/queries/articles";
import { groupByYear } from "@/lib/archive";
import TrendingStrip from "@/components/TrendingStrip";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Archive",
  description: "Every article ever published, by year.",
  alternates: { canonical: "/archive" },
};

export default async function ArchivePage() {
  const rows = await getAllPublishedForArchive();
  const years = groupByYear(rows);
  const total = rows.length;

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
          <i className="fa-solid fa-box-archive" aria-hidden="true" style={{ marginRight: 14, opacity: 0.85 }} />
          Archive
        </h1>
        <p className="lb-feed-sub">
          {total.toLocaleString()} {total === 1 ? "ARTICLE" : "ARTICLES"} SINCE{" "}
          {years[years.length - 1]?.year ?? new Date().getUTCFullYear()}
        </p>
        <div className="lb-feed-line" aria-hidden="true" />
      </header>

      <TrendingStrip days={30} count={5} title="MOST READ THIS MONTH" />

      <main className="lb-archive-years">
        {years.map((y) => (
          <Link key={y.year} className="lb-archive-year-card" href={`/archive/${y.year}`}>
            <span className="lb-archive-year">{y.year}</span>
            <span className="lb-archive-count">
              {y.count.toLocaleString()} {y.count === 1 ? "article" : "articles"}
            </span>
            <i className="fa-solid fa-arrow-right" aria-hidden="true" />
          </Link>
        ))}
        {years.length === 0 && (
          <div className="lb-empty" role="status">
            <div className="lb-empty-icon">🗄️</div>
            Nothing published yet.
          </div>
        )}
      </main>
    </div>
  );
}
