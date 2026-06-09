"use client";
import { useRouter } from "next/navigation";

// The feed title doubles as a hidden admin shortcut: double-click it to jump to
// the admin dashboard (which enforces its own auth/login).
export default function FeedTitle() {
  const router = useRouter();
  return (
    <h1 className="lb-feed-title" onDoubleClick={() => router.push("/admin")}>
      THE BILINGUAL
      <br />
      EXECUTIVE BLOG
    </h1>
  );
}
