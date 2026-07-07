// Shared CSV cell escaper for admin exports (subscribers page, activity export
// route). Quotes every field and neutralises spreadsheet formula injection
// (leading = + - @ tab), since exported values — emails, job titles, activity
// summaries — are visitor- or content-derived.
export function csvCell(v: unknown): string {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}
