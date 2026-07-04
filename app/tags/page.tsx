import type { Metadata } from "next";
import Link from "next/link";
import { getAllPublishedTagRows } from "@/lib/queries/articles";
import { tagCounts, tagWeight } from "@/lib/archive";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Topics",
  description: "Every topic on the blog, weighted by how much has been written about it.",
  alternates: { canonical: "/tags" },
};

export default async function TagsPage() {
  const rows = await getAllPublishedTagRows();
  const counts = tagCounts(rows);
  const max = counts[0]?.count ?? 1;

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
          <i className="fa-solid fa-tags" aria-hidden="true" style={{ marginRight: 14, opacity: 0.85 }} />
          Topics
        </h1>
        <p className="lb-feed-sub">
          {counts.length.toLocaleString()} {counts.length === 1 ? "TOPIC" : "TOPICS"}
        </p>
        <div className="lb-feed-line" aria-hidden="true" />
      </header>

      <main className="lb-tag-cloud" aria-label="All topics">
        {counts.map(({ tag, count }) => (
          <Link
            key={tag}
            className="lb-tag-cloud-chip"
            href={`/tag/${encodeURIComponent(tag)}`}
            style={{ fontSize: tagWeight(count, max) }}
          >
            {tag} <span className="lb-tag-cloud-count">{count}</span>
          </Link>
        ))}
        {counts.length === 0 && (
          <div className="lb-empty" role="status">
            <div className="lb-empty-icon">🏷️</div>
            No topics yet.
          </div>
        )}
      </main>
    </div>
  );
}
