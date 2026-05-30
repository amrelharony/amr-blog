// Shared formatting helpers — server-safe ports of the originals in Js/blog-core.js

/** HTML-escape (server-safe; mirrors B.esc / B.xmlEsc). */
export function esc(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** "N min read" from raw text (B.readingTime). */
export function readingTime(text: string | null | undefined): string {
  const w = (text ?? "").split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.ceil(w / 200))} min read`;
}

/** Human date, e.g. "January 5, 2026" (B.fmtDate). */
export function fmtDate(d: string | number | Date): string {
  try {
    const date = new Date(d);
    if (isNaN(date.getTime())) return "Unknown date";
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return "Unknown date";
  }
}

/** URL slug from a string (B.slugify). */
export function slugify(str: string | null | undefined): string {
  return (str ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
