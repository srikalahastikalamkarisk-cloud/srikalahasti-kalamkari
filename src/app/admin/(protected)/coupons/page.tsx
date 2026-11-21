import CouponsManager from "@/components/admin/coupons-manager";
import "@/components/admin/coupons-manager.css";

export const dynamic = "force-dynamic";

export default function CouponsPage() {
  return (
    <div className="skad-app">
      
      <main className="skad-main">
        <header className="skad-topbar">
          <div className="skad-breadcrumb">
            <span>CONTENT & MARKETING</span>
            <span className="skad-breadcrumb-divider">/</span>
            <strong>Coupons</strong>
          </div>
          <div className="skad-topbar-right">
            <span className="skad-topbar-status">
              <span className="skad-status-dot" />
              ADMIN WORKSPACE
            </span>
          </div>
        </header>
        <div className="skad-content skcoupons-content">
          <CouponsManager />
        </div>
      </main>
    </div>
  );
}
