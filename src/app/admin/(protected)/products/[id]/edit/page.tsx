import EditProductForm from "@/components/admin/edit-product-form";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditProductPage({ params }: Props) {
  const { id } = await params;

  return (
    <div className="skad-app">
      
      <main className="skad-main">
        <header className="skad-topbar">
          <div className="skad-breadcrumb">
            <span>STORE MANAGEMENT</span>
            <span className="skad-breadcrumb-divider">/</span>
            <strong>Edit Product</strong>
          </div>
          <div className="skad-topbar-right">
            <span className="skad-topbar-status">
              <span className="skad-status-dot" />
              ADMIN WORKSPACE
            </span>
          </div>
        </header>
        <EditProductForm productId={id} />
      </main>
    </div>
  );
}
