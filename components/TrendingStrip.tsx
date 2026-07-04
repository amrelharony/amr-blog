import Link from "next/link";
import { getTrendingArticles } from "@/lib/queries/trending";

// Server-rendered "most read lately" list (homepage / article page / archive).
// Renders nothing until the view-rollup migration is live and there are at
// least `minItems` articles with recent views — no layout ever depends on it.
export default async function TrendingStrip({
  days = 7,
  count = 5,
  title = "TRENDING THIS WEEK",
  minItems = 3,
}: {
  days?: number;
  count?: number;
  title?: string;
  minItems?: number;
}) {
  const items = await getTrendingArticles(days, count);
  if (items.length < minItems) return null;

  return (
    <section className="lb-trending lb-reveal" aria-label={title.toLowerCase()}>
      <div className="lb-trending-title">
        <i className="fa-solid fa-arrow-trend-up" aria-hidden="true" /> {title}
      </div>
      <ol className="lb-trending-list">
        {items.map((a, i) => (
          <li key={a.id}>
            <Link href={`/p/${a.slug}`} className="lb-trending-item">
              <span className="lb-trending-rank" aria-hidden="true">
                {i + 1}
              </span>
              <span className="lb-trending-item-title">{a.title}</span>
              <span
                className="lb-trending-views"
                aria-label={`${a.recent_views} recent views`}
              >
                👁 {a.recent_views}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
