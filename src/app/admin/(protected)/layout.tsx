import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/admin-auth";
import AdminSidebar from "@/components/admin/admin-sidebar";

export const dynamic = "force-dynamic";

export default async function ProtectedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await getCurrentAdmin();

  if (!admin) {
    redirect("/admin/login");
  }

  return (
    <div className="skad-shell">
      <AdminSidebar />
      <main className="skad-main">
        {children}
      </main>
    </div>
  );
}
