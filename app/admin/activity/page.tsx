import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { fmtDate } from "@/lib/format";
import {
  ACTIVITY_PAGE_SIZE,
  activityQueryString,
  fetchActivityFacets,
  fetchActivityPage,
  parseActivityFilters,
} from "@/lib/queries/activity";

export const dynamic = "force-dynamic";

const actionPill = (a: string) =>
  a === "publish" ? "live" : a === "delete" || a === "spam" ? "draft" : "sched";

/** Keep a filter value selectable even when facet loading failed / lagged. */
function withCurrent(options: string[], current: string): string[] {
  return current && !options.includes(current) ? [current, ...options] : options;
}

export default async function AdminActivity({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin(); // backstop behind proxy.ts — don't render on RLS alone
  const f = parseActivityFilters(await searchParams);
  const sb = await createClient();

  // Facets fail open: the list still renders, the dropdowns just go sparse.
  const [{ rows, count }, facets] = await Promise.all([
    fetchActivityPage(sb, f),
    fetchActivityFacets(sb).catch(() => ({ actions: [] as string[], entities: [] as string[] })),
  ]);

  const actionOpts = withCurrent(facets.actions, f.action);
  const entityOpts = withCurrent(facets.entities, f.entity);

  // Key both ends off rows.length, not count: a ?page= past the end comes back with
  // no rows (and, on the PGRST103 path, count 0), which previously rendered nonsense
  // like "Showing 0–100 of 0".
  const firstShown = rows.length === 0 ? 0 : (f.page - 1) * ACTIVITY_PAGE_SIZE + 1;
  const lastShown = rows.length === 0 ? 0 : (f.page - 1) * ACTIVITY_PAGE_SIZE + rows.length;
  const hasPrev = f.page > 1;
  const hasNext = f.page * ACTIVITY_PAGE_SIZE < count;
  const filtered = !!(f.action || f.entity || f.from || f.to);

  return (
    <div>
      <div className="adm-h">Activity</div>
      <div className="adm-sub">Admin actions — newest first. Date filters use UTC days.</div>

      {/* Plain GET form: filters live in the URL, so results are shareable and
          the loading.tsx skeleton covers the round trip. */}
      <form method="get" action="/admin/activity" className="adm-card">
        <div className="adm-row">
          <div className="adm-field">
            <label className="adm-label" htmlFor="f-action">
              Action
            </label>
            <select id="f-action" name="action" className="adm-select" defaultValue={f.action}>
              <option value="">All actions</option>
              {actionOpts.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div className="adm-field">
            <label className="adm-label" htmlFor="f-entity">
              Entity
            </label>
            <select id="f-entity" name="entity" className="adm-select" defaultValue={f.entity}>
              <option value="">All entities</option>
              {entityOpts.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>
          <div className="adm-field">
            <label className="adm-label" htmlFor="f-from">
              From (UTC)
            </label>
            <input id="f-from" name="from" type="date" className="adm-input" defaultValue={f.from} />
          </div>
          <div className="adm-field">
            <label className="adm-label" htmlFor="f-to">
              To (UTC)
            </label>
            <input id="f-to" name="to" type="date" className="adm-input" defaultValue={f.to} />
          </div>
        </div>
        <div className="adm-actions" style={{ marginTop: 4 }}>
          <button className="adm-btn primary" type="submit">
            Apply
          </button>
          {filtered && (
            <Link className="adm-btn" href="/admin/activity">
              Reset
            </Link>
          )}
          <a className="adm-btn" href={`/api/admin/activity/export${activityQueryString(f, 1)}`}>
            ⬇ Export CSV
          </a>
        </div>
      </form>

      <div className="adm-list">
        {rows.length === 0 && (
          <div className="adm-sub">{filtered ? "No activity matches these filters." : "No activity recorded yet."}</div>
        )}
        {rows.map((e) => (
          <div key={e.id} className="adm-list-item" style={{ cursor: "default" }}>
            <span className={"adm-pill " + actionPill(e.action)}>{e.action}</span>
            {e.entity_type && <span className="adm-pill">{e.entity_type}</span>}
            <span className="adm-list-title" style={{ fontWeight: 400, fontSize: 13 }}>
              {e.summary || e.entity_id || "—"}
            </span>
            <span className="adm-pill">{fmtDate(e.created_at)}</span>
          </div>
        ))}
      </div>

      <div className="adm-actions" style={{ justifyContent: "space-between" }}>
        <span className="adm-sub" style={{ marginBottom: 0 }}>
          Showing {firstShown.toLocaleString()}–{lastShown.toLocaleString()} of {count.toLocaleString()}
        </span>
        <span style={{ display: "flex", gap: 8 }}>
          {hasPrev && (
            <Link className="adm-btn" href={`/admin/activity${activityQueryString(f, f.page - 1)}`}>
              ← Prev
            </Link>
          )}
          {hasNext && (
            <Link className="adm-btn" href={`/admin/activity${activityQueryString(f, f.page + 1)}`}>
              Next →
            </Link>
          )}
        </span>
      </div>
    </div>
  );
}
