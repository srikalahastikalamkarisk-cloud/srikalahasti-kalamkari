import AddProductForm from "@/components/admin/add-product-form";

export default function AddProductPage() {
  return (
    <div className="skad-app">
      
      <main className="skad-main">
        <header className="skad-topbar">
          <div className="skad-breadcrumb">
            <span>STORE MANAGEMENT</span>
            <span className="skad-breadcrumb-divider">/</span>
            <strong>Add Product</strong>
          </div>
          <div className="skad-topbar-right">
            <span className="skad-topbar-status">
              <span className="skad-status-dot" />
              ADMIN WORKSPACE
            </span>
          </div>
        </header>
        <AddProductForm />
      </main>
    </div>
  );
}
