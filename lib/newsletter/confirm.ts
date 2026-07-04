// Pure validation/decision helpers for the newsletter double-opt-in route
// (app/api/newsletter/confirm). Kept free of Supabase/Next so the token/email
// gates and the PostgREST result-shape decision are unit-testable.

/** GET-side confirm token: URL-safe charset, bounded length. */
export function isValidConfirmToken(token: string | null): boolean {
  return !!token && token.length <= 500 && /^[\w-]+$/.test(token);
}

/** POST-side request: plausible email (bounded) + UUID-shaped pending token. */
export function isValidConfirmRequest(email: unknown, token: unknown): boolean {
  return (
    typeof email === "string" &&
    email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
    typeof token === "string" &&
    /^[0-9a-f-]{36}$/i.test(token)
  );
}

/** confirm_newsletter returns a boolean — false for an unknown/expired/used
 *  token — and PostgREST replies HTTP 200 even when it returns false, so
 *  `res.ok` alone isn't a success signal. Treat ONLY an explicit `false` as
 *  failure so any other return shape can't regress valid confirmations. */
export function confirmationSucceeded(resOk: boolean, body: unknown): boolean {
  if (!resOk) return false;
  return body !== false;
}
