import type { Metadata } from "next";
import "./admin.css";
import AdminNav from "@/components/AdminNav";
import AdminCommandPalette from "@/components/AdminCommandPalette";
import AdminToaster from "@/components/AdminToaster";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="adm-wrap">
      <AdminNav />
      {children}
      <AdminCommandPalette />
      <AdminToaster />
    </div>
  );
}
