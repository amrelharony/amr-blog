// Pure heading-id assignment for the article table of contents. Extracted from
// ArticleReader so the slug + collision logic is unit-testable. No DOM: the
// caller maps its h2/h3 nodes to inputs, then writes the returned ids back.
import { slugify } from "@/lib/format";

export interface HeadingInput {
  tag: string; // "H2" | "H3" (case-insensitive)
  text: string;
  existingId?: string; // honor an author-supplied id if present
}

export interface TocItem {
  id: string;
  text: string;
  depth: 2 | 3;
}

/**
 * Assign a stable, unique id to each heading. Honors an existing id, else
 * slugifies the text (falling back to "section"), then guarantees uniqueness
 * by suffixing -2, -3, … and re-checking against every id already emitted —
 * so inputs like ["Setup", "Setup", "Setup 2"] yield three distinct ids
 * instead of two colliding "setup-2"s.
 */
export function assignHeadingIds(headings: HeadingInput[]): TocItem[] {
  const used = new Set<string>();
  return headings.map((h) => {
    const text = (h.text || "").trim();
    const base = h.existingId || slugify(text) || "section";
    let id = base;
    let i = 2;
    while (used.has(id)) {
      id = `${base}-${i}`;
      i++;
    }
    used.add(id);
    return { id, text, depth: h.tag.toUpperCase() === "H3" ? 3 : 2 };
  });
}
