// Pure aggregation helpers for the admin analytics dashboard. No DOM/Supabase,
// so they're unit-testable. All bucketing is UTC for determinism.

export interface Bucket {
  label: string;
  count: number;
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
/** Monday (UTC) of the week, as YYYY-MM-DD — unambiguous and sortable. */
function weekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const sinceMon = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - sinceMon);
  return t.toISOString().slice(0, 10);
}

/** Count ISO timestamps per period, chronological. Invalid dates are skipped. */
export function bucketByPeriod(dates: Array<string | null | undefined>, period: "week" | "month"): Bucket[] {
  const counts = new Map<string, number>();
  for (const d of dates) {
    if (!d) continue;
    const dt = new Date(d);
    if (isNaN(dt.getTime())) continue;
    const key = period === "month" ? monthKey(dt) : weekKey(dt);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([label, count]) => ({ label, count }));
}

/** Running total over chronological buckets. */
export function cumulative(buckets: Bucket[]): Array<{ label: string; total: number }> {
  let run = 0;
  return buckets.map((b) => {
    run += b.count;
    return { label: b.label, total: run };
  });
}

/** Sum reaction maps across rows into { key, count }, sorted desc. */
export function sumReactions(rows: Array<{ reactions: Record<string, number> | null }>): Array<{ key: string; count: number }> {
  const totals = new Map<string, number>();
  for (const r of rows) {
    for (const [k, v] of Object.entries(r.reactions || {})) totals.set(k, (totals.get(k) || 0) + (v || 0));
  }
  return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count }));
}

/** Tag distribution: count + total views per tag, top `max`, sorted by count. */
export function tagDistribution(
  arts: Array<{ tags: string[] | null; views: number | null }>,
  max = 12,
): Array<{ tag: string; count: number; views: number }> {
  const m = new Map<string, { count: number; views: number }>();
  for (const a of arts) {
    for (const tag of a.tags || []) {
      const cur = m.get(tag) || { count: 0, views: 0 };
      cur.count++;
      cur.views += a.views || 0;
      m.set(tag, cur);
    }
  }
  return [...m.entries()]
    .sort((a, b) => b[1].count - a[1].count || b[1].views - a[1].views)
    .slice(0, max)
    .map(([tag, v]) => ({ tag, count: v.count, views: v.views }));
}

/** SVG polyline points for a sparkline in a w×h box (normalized to max). */
export function sparklinePoints(values: number[], w: number, h: number, pad = 2): string {
  if (values.length === 0) return "";
  const max = Math.max(1, ...values);
  const span = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;
  return values
    .map((v, i) => {
      const x = pad + i * span;
      const y = h - pad - (v / max) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}
