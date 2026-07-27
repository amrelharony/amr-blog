"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getLists, type ReadingList } from "@/lib/collections";

// Feed strip listing the visitor's non-empty collections (saved reading lists).
export default function CollectionsStrip() {
  const [lists, setLists] = useState<ReadingList[]>([]);
  useEffect(() => {
    setLists(getLists().filter((l) => l.items.length > 0));
  }, []);
  if (!lists.length) return null;
  return (
    <div className="lb-continue lb-reveal" id="lbCollections" style={{ marginTop: 8 }}>
      <div className="lb-continue-title">
        <i className="fa-solid fa-layer-group" /> Your Collections
      </div>
      {lists.map((l) => (
        <div key={l.id} style={{ marginBottom: 10 }}>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: "var(--sub)", margin: "6px 0" }}>
            {l.emoji} {l.name} ({l.items.length})
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {l.items.map((it) => (
              // next/link, like every other feed card (ArticleCardV2): a plain <a> is a
              // full document load, which re-runs the Intro overlay animation over the
              // article the reader just asked for.
              <Link key={it.articleId} href={`/p/${it.slug}`} className="lb-card-tag" style={{ textDecoration: "none", padding: "4px 10px" }}>
                {it.title || it.slug}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
