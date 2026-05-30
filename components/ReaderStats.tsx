"use client";
import { useEffect, useState } from "react";
import { getReaderStats } from "@/lib/reader-stats";

// Standalone reading gamification badge (streak + read/finished counts).
export default function ReaderStats() {
  const [st, setSt] = useState<{ streak: number; read: number; completed: number } | null>(null);
  useEffect(() => {
    const s = getReaderStats();
    if (s.read > 0) setSt(s);
  }, []);
  if (!st) return null;
  return (
    <div
      className="lb-reveal"
      style={{ display: "flex", gap: 10, justifyContent: "center", margin: "4px 0 18px", flexWrap: "wrap" }}
    >
      {st.streak > 0 && <span className="lb-card-tag">🔥 {st.streak}-day streak</span>}
      <span className="lb-card-tag">📖 {st.read} read</span>
      {st.completed > 0 && <span className="lb-card-tag">✅ {st.completed} finished</span>}
    </div>
  );
}
