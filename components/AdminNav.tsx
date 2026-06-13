"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase/browser";

const TABS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/write", label: "Write" },
  { href: "/admin/thoughts", label: "Thoughts" },
  { href: "/admin/subscribers", label: "Subscribers" },
  { href: "/admin/comments", label: "Comments" },
  { href: "/admin/analytics", label: "Analytics" },
];

export default function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();
  if (pathname === "/admin/login") return null;

  const logout = async () => {
    await getBrowserClient().auth.signOut();
    router.push("/admin/login");
    router.refresh();
  };

  return (
    <nav className="adm-nav">
      <span className="adm-brand">AMR · ADMIN</span>
      {TABS.map((t) => {
        const active = t.href === "/admin" ? pathname === "/admin" : pathname.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} className={"adm-nav-link" + (active ? " active" : "")}>
            {t.label}
          </Link>
        );
      })}
      <span className="adm-nav-spacer" />
      <button
        className="adm-nav-link"
        onClick={() => window.dispatchEvent(new Event("admin:palette"))}
        title="Command palette (Ctrl K)"
        aria-label="Open command palette"
      >
        ⌘K
      </button>
      <Link href="/" className="adm-nav-link">
        View site ↗
      </Link>
      <button className="adm-nav-link" onClick={logout}>
        Logout
      </button>
    </nav>
  );
}
