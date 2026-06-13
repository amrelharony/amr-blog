"use client";
import { useEffect, useRef, useState } from "react";
import type { SearchResponse } from "@/lib/search";

// Shared debounced /api/search fetch used by FeedSearch and CommandPalette:
// per-keystroke debounce, abort of the in-flight request, min-length gate,
// and abort on unmount. `onError` decides the caller's degradation path
// (FeedSearch falls back to its DOM filter; the palette just logs) — it must
// be referentially stable (useCallback) or the effect re-runs per render.
export const MIN_SEARCH_QUERY = 2;

export function useSearch(
  q: string,
  {
    enabled = true,
    delayMs = 300,
    onError,
  }: { enabled?: boolean; delayMs?: number; onError?: (e: unknown) => void } = {},
) {
  const [res, setRes] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => {
    const query = q.trim();
    if (!enabled || query.length < MIN_SEARCH_QUERY) {
      // Kill any in-flight request so a late response can't repopulate res
      // after the caller cleared or closed.
      ctrl.current?.abort();
      setRes(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      ctrl.current?.abort();
      const ac = new AbortController();
      ctrl.current = ac;
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: ac.signal });
        if (!r.ok) throw new Error(`search HTTP ${r.status}`);
        const data = (await r.json()) as SearchResponse;
        if (!ac.signal.aborted) {
          setRes(data);
          setLoading(false);
        }
      } catch (e) {
        if (ac.signal.aborted) return;
        setLoading(false);
        if (onError) onError(e);
        else console.error("[useSearch]", e);
      }
    }, delayMs);
    return () => clearTimeout(t);
  }, [q, enabled, delayMs, onError]);

  // Abort any in-flight request when the consumer unmounts.
  useEffect(() => {
    const ref = ctrl;
    return () => ref.current?.abort();
  }, []);

  return { res, loading, abort: () => ctrl.current?.abort() };
}
