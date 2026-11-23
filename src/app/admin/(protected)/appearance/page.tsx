import type { Metadata } from "next";
import ThemeManager from "@/components/admin/theme-manager";

export const metadata: Metadata = { title: "Appearance & Themes | Srikalahasti Kalamkari Admin" };

export default function AppearancePage() {
  return <ThemeManager />;
}
