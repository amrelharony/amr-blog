import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllPublishedForArchive } from "@/lib/queries/articles";
import { articlesInYear, groupByYear } from "@/lib/archive";
import { fmtDate } from "@/lib/format";

export const revalidate = 3600;

type Params = { params: Promise<{ year: string }> };

export async function generateStaticParams() {
  const rows = await getAllPublishedForArchive();
  return groupByYear(rows).map((y) => ({ year: String(y.year) }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { year } = await params;
  return {
    title: `${year} Archive`,
    description: `All articles published in ${year}.`,
    alternates: { canonical: `/archive/${year}` },
  };
}

export default async function ArchiveYearPage({ params }: Params) {
  const { year } = await params;
  if (!/^\d{4}$/.test(year)) notFound();
  const y = Number(year);

  const rows = await getAllPublishedForArchive();
  const articles = articlesInYear(rows, y);
  if (articles.length === 0) notFound();

  // Group by month for scannability (rows are already newest-first).
  const months = new Map<string, typeof articles>();
  for (const a of articles) {
    const key = new Date(a.created_at).toLocaleDateString("en-US", {
      month: "long",
      timeZone: "UTC",
    });
    if (!months.has(key)) months.set(key, []);
    months.get(key)!.push(a);
  }

  return (
    <div className="lb-wrap" style={{ maxWidth: 900 }}>
      <nav className="lb-nav" role="navigation" aria-label="Blog navigation">
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Link className="lb-nav-back" href="/archive" role="link">
            <i className="fa-solid fa-arrow-left" aria-hidden="true" /> <span>Archive</span>
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
          {year}
        </h1>
        <p className="lb-feed-sub">
          {articles.length.toLocaleString()} {articles.length === 1 ? "ARTICLE" : "ARTICLES"}
        </p>
        <div className="lb-feed-line" aria-hidden="true" />
      </header>

      <main className="lb-archive-list">
        {[...months.entries()].map(([month, list]) => (
          <section key={month} className="lb-archive-month">
            <h2 className="lb-archive-month-title">{month}</h2>
            <ul>
              {list.map((a) => (
                <li key={a.slug}>
                  <Link href={`/p/${a.slug}`} className="lb-archive-item">
                    <time className="lb-archive-date" dateTime={a.created_at}>
                      {fmtDate(a.created_at)}
                    </time>
                    <span className="lb-archive-title">{a.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
    </div>
  );
}
