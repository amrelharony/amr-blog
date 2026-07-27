// Pure helpers for the reader library (/library): parsing, exporting, and
// merge-importing the client-side reader data. The actual localStorage I/O
// stays in the client component — everything here is unit-testable.
//
// Store shapes (established elsewhere — do not change here):
//   _lb_reading_lists   {lists: ReadingList[]}            lib/collections.ts
//   _lb_annotations     Record<articleId, Ann[]>          components/Annotations.tsx
//   _lb_reading_history Record<articleId, HistoryEntry>   components/ReadingTracker.tsx

export const READER_KEYS = {
  lists: "_lb_reading_lists",
  annotations: "_lb_annotations",
  history: "_lb_reading_history",
  theme: "theme",
} as const;

export interface ExportedList {
  id: string;
  cloudId?: string | null;
  name: string;
  emoji: string;
  isDefault?: boolean;
  items: { articleId: string; slug: string; title?: string; addedAt?: string }[];
}

export interface ExportedAnnotation {
  id: string;
  text: string;
  note: string | null;
  color: string;
  start: number;
  end: number;
  created_at: string;
}

export interface ExportedHistoryEntry {
  slug?: string;
  title?: string;
  progress?: number;
  completed?: boolean;
  last_read_at?: string;
}

export interface ReaderExport {
  version: 1;
  exported_at: string;
  lists: ExportedList[];
  annotations: Record<string, ExportedAnnotation[]>;
  history: Record<string, ExportedHistoryEntry>;
  theme: string | null;
}

/** Max accepted import payload — reader data is small; anything bigger is wrong. */
export const MAX_IMPORT_BYTES = 2_000_000;

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Assemble the export document from raw localStorage strings. */
export function buildExport(raw: {
  lists: string | null;
  annotations: string | null;
  history: string | null;
  theme: string | null;
}): ReaderExport {
  return {
    version: 1,
    exported_at: new Date().toISOString(),
    lists: parseJson<{ lists: ExportedList[] }>(raw.lists, { lists: [] }).lists || [],
    annotations: parseJson<Record<string, ExportedAnnotation[]>>(raw.annotations, {}),
    history: parseJson<Record<string, ExportedHistoryEntry>>(raw.history, {}),
    theme: raw.theme,
  };
}

/** Parse + shape-check an import payload. Throws Error with a friendly message. */
export function validateImport(json: string): ReaderExport {
  if (json.length > MAX_IMPORT_BYTES) throw new Error("File is too large to be a reader export.");
  let doc: unknown;
  try {
    doc = JSON.parse(json);
  } catch {
    throw new Error("Not valid JSON.");
  }
  const d = doc as Partial<ReaderExport>;
  if (!d || typeof d !== "object" || d.version !== 1) {
    throw new Error("Not a reader export (missing version: 1).");
  }
  return {
    version: 1,
    exported_at: typeof d.exported_at === "string" ? d.exported_at : "",
    lists: Array.isArray(d.lists) ? d.lists.filter((l) => l && typeof l.id === "string") : [],
    annotations:
      d.annotations && typeof d.annotations === "object" && !Array.isArray(d.annotations)
        ? (d.annotations as Record<string, ExportedAnnotation[]>)
        : {},
    history:
      d.history && typeof d.history === "object" && !Array.isArray(d.history)
        ? (d.history as Record<string, ExportedHistoryEntry>)
        : {},
    theme: typeof d.theme === "string" ? d.theme : null,
  };
}

/**
 * Merge imported lists into current ones (current wins on conflicts).
 * Lists match by name (ids are device-local); items dedupe by articleId.
 */
export function mergeLists(current: ExportedList[], incoming: ExportedList[]): ExportedList[] {
  const out = current.map((l) => ({ ...l, items: [...l.items] }));
  for (const inc of incoming) {
    if (!inc || !Array.isArray(inc.items)) continue;
    const match = out.find((l) => l.name === inc.name || (inc.isDefault && l.isDefault));
    if (!match) {
      out.push({ ...inc, cloudId: null, items: [...inc.items] });
      continue;
    }
    const seen = new Set(match.items.map((it) => it.articleId));
    for (const it of inc.items) {
      if (it?.articleId && !seen.has(it.articleId)) {
        seen.add(it.articleId);
        match.items.push(it);
      }
    }
  }
  return out;
}

/** Merge annotations per article, deduped by annotation id (current wins). */
export function mergeAnnotations(
  current: Record<string, ExportedAnnotation[]>,
  incoming: Record<string, ExportedAnnotation[]>,
): Record<string, ExportedAnnotation[]> {
  const out: Record<string, ExportedAnnotation[]> = {};
  for (const [k, v] of Object.entries(current)) out[k] = [...v];
  for (const [articleId, anns] of Object.entries(incoming)) {
    if (!Array.isArray(anns)) continue;
    // hasOwn, not truthiness: article ids come from imported JSON, so a key like
    // "constructor" resolves through Object.prototype — the init was skipped and
    // `.map` on the inherited function threw, bypassing validateImport's contract
    // that a bad file yields a friendly error rather than a crash.
    if (!Object.hasOwn(out, articleId)) out[articleId] = [];
    const seen = new Set(out[articleId].map((a) => a.id));
    for (const a of anns) {
      if (a?.id && !seen.has(a.id)) {
        seen.add(a.id);
        out[articleId].push(a);
      }
    }
  }
  return out;
}

/** Merge history keeping whichever entry read further / more recently. */
export function mergeHistory(
  current: Record<string, ExportedHistoryEntry>,
  incoming: Record<string, ExportedHistoryEntry>,
): Record<string, ExportedHistoryEntry> {
  const out: Record<string, ExportedHistoryEntry> = { ...current };
  for (const [id, inc] of Object.entries(incoming)) {
    if (!inc || typeof inc !== "object") continue;
    // hasOwn for the same reason as mergeAnnotations: a key named after an
    // Object.prototype member would otherwise merge against an inherited function.
    const cur = Object.hasOwn(out, id) ? out[id] : undefined;
    if (!cur) {
      out[id] = inc;
      continue;
    }
    const curTime = cur.last_read_at || "";
    const incTime = inc.last_read_at || "";
    out[id] = {
      ...(incTime > curTime ? { ...cur, ...inc } : { ...inc, ...cur }),
      progress: Math.max(cur.progress || 0, inc.progress || 0),
      completed: Boolean(cur.completed || inc.completed),
    };
  }
  return out;
}
