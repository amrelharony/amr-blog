import Link from "next/link";
import type { Crumb } from "@/lib/breadcrumbs";

// Visible breadcrumb trail mirroring the BreadcrumbList JSON-LD — both are built
// from the same Crumb[] (lib/breadcrumbs.ts) so they can never diverge. The last
// crumb is the current page: plain text with aria-current, not a link.
export default function Breadcrumbs({ crumbs, siteUrl }: { crumbs: Crumb[]; siteUrl: string }) {
  return (
    <nav className="lb-breadcrumbs" aria-label="Breadcrumb">
      <ol>
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          // Crumb items are absolute (for JSON-LD); strip the origin for <Link>.
          const href = c.item.startsWith(siteUrl) ? c.item.slice(siteUrl.length) || "/" : c.item;
          return (
            <li key={c.item}>
              {last ? <span aria-current="page">{c.name}</span> : <Link href={href}>{c.name}</Link>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
