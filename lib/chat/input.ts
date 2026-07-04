// Pure input-handling helpers for the chat route (app/api/chat). Kept here,
// free of Supabase/Next, so the sanitization, history validation, and the
// instruction-injection fence are unit-testable — same split as
// lib/chat/rate-limit.ts (vitest covers lib/** only).

export const MAX_MSG_LEN = 500;
export const MAX_HISTORY = 10;

/** Strip HTML tags and C0 control chars (keeping \t \n \r), then trim. */
export function sanitize(str: unknown): string {
  if (typeof str !== "string") return "";
  return str.replace(/<[^>]*>/g, "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "").trim();
}

export type Msg = { role: "user" | "assistant"; content: string };

export function validateHistory(history: unknown): Msg[] {
  if (!Array.isArray(history)) return [];
  return history
    .filter(
      (m): m is Msg =>
        m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
    )
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role, content: sanitize(m.content).slice(0, MAX_MSG_LEN * 2) }));
}

/** Strip the ⟦⟧ sentinel chars so untrusted content can't forge a fence marker. */
export function fenceContext(s: string): string {
  return s.replace(/[⟦⟧]/g, "");
}

/** Assemble the user turn: fence untrusted context (the current article and the
 *  matched KB text) so an agent-authored title/excerpt can't inject instructions,
 *  then append the actual question outside the fences. */
export function buildUserContent(message: string, pageContext: string, kbContext: string): string {
  const parts: string[] = [];
  if (pageContext) {
    parts.push(`⟦CONTEXT⟧ The user is currently reading this article:\n${fenceContext(pageContext)}\n⟦/CONTEXT⟧`);
  }
  if (kbContext) {
    parts.push(`⟦CONTEXT⟧ Reference info about Amr:\n${fenceContext(kbContext)}\n⟦/CONTEXT⟧`);
  }
  return parts.length ? `${parts.join("\n\n")}\n\nQuestion: ${message}` : message;
}
