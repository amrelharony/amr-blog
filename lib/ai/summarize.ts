// TL;DR generation shared by the admin summarize route and the batch backfill
// (scripts/backfill-tldr.mjs mirrors cleanTldr — keep them in sync). The prompt
// and caps were extracted verbatim from app/api/admin/summarize/route.ts.
import { openclawComplete } from "@/lib/ai/openclaw";

/** Chars of article body sent upstream (keeps input in budget). */
export const MAX_SUMMARY_CONTENT = 6000;
/** Storage cap — mirrors MAX_TLDR in app/api/articles/route.ts. */
export const MAX_TLDR = 500;

export const TLDR_SYSTEM_PROMPT =
  "You write a TL;DR for a blog article by Amr Elharony. Summarize the article below in 2-3 sentences (under 60 words). Speak as Amr in the first person, plainly and concretely. Capture the core thesis and takeaway only — do NOT invent facts, numbers, or links not present in the text. Return plain prose with no preamble, no markdown, no quotes.";

export function buildTldrUserContent(title: string, content: string): string {
  const t = title.trim().slice(0, 200);
  return `${t ? `Title: ${t}\n\n` : ""}Article:\n${content.trim().slice(0, MAX_SUMMARY_CONTENT)}`;
}

/** Strip stray markup/control chars and surrounding quotes; cap length. Pure. */
export function cleanTldr(raw: string): string {
  return raw
    .replace(/<[^>]{0,2048}>/g, "") // bounded — runs on model output at request time
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .trim()
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .trim()
    .slice(0, MAX_TLDR);
}

/** Generate a cleaned TL;DR. Throws (OpenClawError or empty-output Error). */
export async function generateTldr(title: string, content: string): Promise<string> {
  const raw = await openclawComplete({
    system: TLDR_SYSTEM_PROMPT,
    user: buildTldrUserContent(title, content),
    maxTokens: 220,
    temperature: 0.4,
  });
  const tldr = cleanTldr(raw);
  if (!tldr) throw new Error("AI returned an empty summary.");
  return tldr;
}
