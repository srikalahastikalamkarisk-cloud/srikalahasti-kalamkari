import InventoryManager from "@/components/admin/inventory-manager";

export const dynamic = "force-dynamic";

export default function InventoryPage() {
  return (
    <div className="skad-app">
      
      <main className="skad-main">
        <header className="skad-topbar">
          <div className="skad-breadcrumb">
            <span>STORE MANAGEMENT</span>
            <span className="skad-breadcrumb-divider">/</span>
            <strong>Inventory</strong>
          </div>
          <div className="skad-topbar-right">
            <span className="skad-topbar-status"><span className="skad-status-dot" />ADMIN WORKSPACE</span>
          </div>
        </header>
        <InventoryManager />
      </main>
    </div>
  );
}
