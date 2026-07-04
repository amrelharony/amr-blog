import type { Metadata } from "next";
import Link from "next/link";
import { getAllSeriesRows } from "@/lib/queries/articles";
import { seriesIndex } from "@/lib/archive";
import { fmtDate } from "@/lib/format";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Series",
  description: "Multi-part deep dives, in reading order.",
  alternates: { canonical: "/series" },
};

export default async function SeriesIndexPage() {
  const rows = await getAllSeriesRows();
  const series = seriesIndex(rows);

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
          <i className="fa-solid fa-layer-group" aria-hidden="true" style={{ marginRight: 14, opacity: 0.85 }} />
          Series
        </h1>
        <p className="lb-feed-sub">
          {series.length.toLocaleString()} {series.length === 1 ? "SERIES" : "SERIES"}
        </p>
        <div className="lb-feed-line" aria-hidden="true" />
      </header>

      <main className="lb-archive-years" aria-label="All series">
        {series.map((s) => (
          <Link
            key={s.name}
            className="lb-archive-year-card"
            href={`/series/${encodeURIComponent(s.name)}`}
          >
            <span className="lb-series-name">{s.name}</span>
            <span className="lb-archive-count">
              {s.count} {s.count === 1 ? "part" : "parts"} · updated {fmtDate(s.latest)}
            </span>
            <i className="fa-solid fa-arrow-right" aria-hidden="true" />
          </Link>
        ))}
        {series.length === 0 && (
          <div className="lb-empty" role="status">
            <div className="lb-empty-icon">📚</div>
            No series yet.
          </div>
        )}
      </main>
    </div>
  );
}
