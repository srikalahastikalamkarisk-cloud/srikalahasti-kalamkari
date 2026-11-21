import CategoriesManager from "@/components/admin/categories-manager";

export default function CategoriesPage() {
  return (
    <div className="skad-app">
      
      <main className="skad-main">
        <header className="skad-topbar">
          <div className="skad-breadcrumb">
            <span>STORE MANAGEMENT</span>
            <span className="skad-breadcrumb-divider">/</span>
            <strong>Categories</strong>
          </div>
          <div className="skad-topbar-right">
            <span className="skad-topbar-status">
              <span className="skad-status-dot" />
              ADMIN WORKSPACE
            </span>
          </div>
        </header>
        <CategoriesManager />
      </main>
    </div>
  );
}
