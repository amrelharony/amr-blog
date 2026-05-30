"use client";
import { useEffect, useState } from "react";
import {
  getLists,
  ensureDefault,
  createList,
  isInList,
  addToList,
  removeFromList,
  COLL_EMOJIS,
  type ReadingList,
} from "@/lib/collections";

// Article "Save to collection" control — ported from _showCollPopover in
// Js/blog-reader-data.js. Toggles the current article into named reading lists.
export default function CollectionsManager({
  articleId,
  slug,
  title,
  coverImage,
}: {
  articleId: string;
  slug: string;
  title: string;
  coverImage: string;
}) {
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<ReadingList[]>([]);
  const [newName, setNewName] = useState("");

  const refresh = () => setLists([...getLists()]);
  useEffect(() => {
    ensureDefault();
    refresh();
  }, []);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".lb-coll-mgr")) setOpen(false);
    };
    document.addEventListener("click", h);
    return () => document.removeEventListener("click", h);
  }, [open]);

  const item = () => ({ articleId, slug, title, cover_image: coverImage, addedAt: new Date().toISOString() });
  const savedCount = lists.filter((l) => isInList(l.id, articleId)).length;

  const toggle = (listId: string) => {
    if (isInList(listId, articleId)) removeFromList(listId, articleId);
    else addToList(listId, item());
    refresh();
  };
  const create = () => {
    if (!newName.trim()) return;
    const l = createList(newName.trim(), COLL_EMOJIS[Math.floor(Math.random() * COLL_EMOJIS.length)]);
    addToList(l.id, item());
    setNewName("");
    refresh();
  };

  return (
    <span className="lb-coll-mgr" style={{ position: "relative", display: "inline-block" }}>
      <button
        className={"lb-bookmark-btn" + (savedCount ? " active" : "")}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        <i className={"fa-" + (savedCount ? "solid" : "regular") + " fa-bookmark"} aria-hidden="true" />{" "}
        {savedCount ? "Saved" : "Save"}
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            right: 0,
            zIndex: 50,
            background: "var(--bg2)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: 10,
            minWidth: 230,
            boxShadow: "0 12px 32px rgba(0,0,0,.45)",
          }}
        >
          <div
            style={{
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: 1,
              color: "var(--sub)",
              marginBottom: 8,
              fontFamily: "'JetBrains Mono',monospace",
            }}
          >
            Save to collection
          </div>
          {lists.map((l) => {
            const inList = isInList(l.id, articleId);
            return (
              <div
                key={l.id}
                onClick={() => toggle(l.id)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: 8, cursor: "pointer" }}
              >
                <span>{l.emoji}</span>
                <span style={{ flex: 1, fontSize: 13, color: "var(--text)" }}>
                  {l.name} <span style={{ color: "var(--sub)", fontSize: 11 }}>({l.items.length})</span>
                </span>
                <i
                  className={"fa-" + (inList ? "solid fa-circle-check" : "regular fa-circle")}
                  style={{ color: inList ? "var(--accent)" : "var(--sub)" }}
                />
              </div>
            );
          })}
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New collection…"
              onKeyDown={(e) => {
                if (e.key === "Enter") create();
              }}
              style={{
                flex: 1,
                background: "rgba(0,0,0,.25)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "6px 8px",
                color: "var(--text)",
                fontSize: 12,
                outline: "none",
              }}
            />
            <button
              onClick={create}
              style={{ background: "var(--accent)", color: "#06080f", border: "none", borderRadius: 6, padding: "0 12px", cursor: "pointer", fontWeight: 700 }}
            >
              ＋
            </button>
          </div>
        </div>
      )}
    </span>
  );
}
