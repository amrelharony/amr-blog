// Just-in-time anonymous auth — ported from Js/auth-manager.js. RLS requires
// auth.uid() IS NOT NULL to post comments, so we sign in anonymously on first write.
import { getBrowserClient } from "./browser";

let sessionPromise: Promise<string | null> | null = null;

export function ensureAnonSession(): Promise<string | null> {
  if (sessionPromise) return sessionPromise;
  const sb = getBrowserClient();
  sessionPromise = (async () => {
    try {
      const {
        data: { session },
      } = await sb.auth.getSession();
      if (session) return session.user.id;
      const { data, error } = await sb.auth.signInAnonymously();
      if (error) throw error;
      return data.session?.user?.id ?? null;
    } catch {
      sessionPromise = null; // allow retry on next action
      return null;
    }
  })();
  return sessionPromise;
}
