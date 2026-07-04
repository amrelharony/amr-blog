import Link from "next/link";
import { fmtDate } from "@/lib/format";
import type { ArticleCard } from "@/lib/types";

// Prominent single "Read next" pick rendered after the article body — the
// strongest related article (see getReadNextAndRelated in lib/queries/articles.ts).
export default function ReadNext({ a }: { a: ArticleCard }) {
  return (
    <div className="lb-read-next lb-reveal">
      <div className="lb-read-next-label">READ NEXT</div>
      <Link className="lb-read-next-card" href={`/p/${a.slug}`}>
        <div className="lb-read-next-title">{a.title}</div>
        {a.excerpt && <p className="lb-read-next-excerpt">{a.excerpt}</p>}
        <div className="lb-read-next-meta">
          <span>{fmtDate(a.created_at)}</span>
          {a.views ? <span>👁 {a.views}</span> : null}
          <span className="lb-read-next-cta">
            Continue reading <i className="fa-solid fa-arrow-right" aria-hidden="true" />
          </span>
        </div>
      </Link>
    </div>
  );
}
