import ProductImport from "@/components/admin/product-import";

export default function ProductImportPage() {
  return <div className="skad-app"><main className="skad-main">
    <header className="skad-topbar"><div className="skad-breadcrumb"><span>STORE MANAGEMENT</span><span className="skad-breadcrumb-divider">/</span><strong>Bulk Product Import</strong></div></header>
    <ProductImport />
  </main></div>;
}
