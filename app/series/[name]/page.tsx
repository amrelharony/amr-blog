import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSeriesSiblings } from "@/lib/queries/articles";

export const revalidate = 3600;

type Params = { params: Promise<{ name: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { name } = await params;
  return {
    title: `Series: ${name}`,
    description: `All parts of the "${name}" series, in reading order.`,
    alternates: { canonical: `/series/${encodeURIComponent(name)}` },
  };
}

export default async function SeriesPage({ params }: Params) {
  const { name } = await params;
  const parts = await getSeriesSiblings(name);
  if (parts.length === 0) notFound();

  return (
    <div className="lb-wrap" style={{ maxWidth: 900 }}>
      <nav className="lb-nav" role="navigation" aria-label="Blog navigation">
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Link className="lb-nav-back" href="/series" role="link">
            <i className="fa-solid fa-arrow-left" aria-hidden="true" /> <span>Series</span>
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
        <h1 className="lb-feed-title" style={{ fontSize: "clamp(28px, 5vw, 44px)" }}>
          {name}
        </h1>
        <p className="lb-feed-sub">
          {parts.length} {parts.length === 1 ? "PART" : "PARTS"}
        </p>
        <div className="lb-feed-line" aria-hidden="true" />
      </header>

      <main className="lb-series-parts" aria-label="Series parts in order">
        <ol>
          {parts.map((p, i) => (
            <li key={p.id}>
              <Link href={`/p/${p.slug}`} className="lb-series-part">
                <span className="lb-series-part-num">{i + 1}</span>
                <span className="lb-series-part-title">{p.title}</span>
                <i className="fa-solid fa-arrow-right" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ol>
      </main>
    </div>
  );
}
