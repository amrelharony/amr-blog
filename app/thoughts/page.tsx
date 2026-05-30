import type { Metadata } from "next";
import Link from "next/link";
import "@/app/thoughts.css";
import { getThoughts } from "@/lib/queries/microblog";
import ThoughtsFeed from "@/components/ThoughtsFeed";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Thoughts",
  description: "Short-form thoughts on Agile, FinTech, and Data by Amr Elharony.",
  alternates: { canonical: "/thoughts" },
};

export default async function ThoughtsPage() {
  const initial = await getThoughts(15, 0);

  return (
    <div className="thoughts-page">
      <nav className="lb-nav" role="navigation" aria-label="Thoughts navigation">
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Link className="lb-nav-back" href="/" role="link">
            <i className="fa-solid fa-arrow-left" aria-hidden="true" /> <span>Articles</span>
          </Link>
          <span className="lb-nav-sep" aria-hidden="true" />
          <Link className="lb-nav-brand" href="/" role="link">
            AMR ELHARONY
          </Link>
        </div>
      </nav>

      <div className="thoughts-head">
        <div className="blog-title">💭 Delivery Notes</div>
        <div className="blog-subtitle">Live thoughts on Agile, FinTech, and Data.</div>
      </div>

      <ThoughtsFeed initial={initial} />
    </div>
  );
}
