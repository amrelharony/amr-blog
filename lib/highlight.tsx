// Shared <mark> term highlighting for search UIs (FeedSearch, CommandPalette).
// Pure text splitting — no HTML strings are injected.
import type { ReactNode } from "react";

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Wrap query-term hits in <mark>, via text splitting. */
export function highlight(text: string, terms: string[]): ReactNode {
  if (!text || terms.length === 0) return text;
  const re = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi");
  // With a single capturing group, odd indices of split() are the matches.
  return text.split(re).map((part, i) => (i % 2 === 1 ? <mark key={i}>{part}</mark> : part));
}
