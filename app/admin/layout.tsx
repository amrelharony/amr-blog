import type { Metadata } from "next";
import "./admin.css";
import AdminNav from "@/components/AdminNav";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="adm-wrap">
      <AdminNav />
      {children}
    </div>
  );
}
