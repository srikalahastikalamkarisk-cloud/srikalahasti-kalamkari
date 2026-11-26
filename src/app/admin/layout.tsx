import type { Metadata } from "next";
import "./admin-theme.css";

export const metadata: Metadata = { robots: { index: false, follow: false, noarchive: true } };

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="sk-admin-theme-root">{children}</div>;
}
