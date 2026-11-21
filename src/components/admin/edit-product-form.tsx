"use client";

import AddProductForm from "./add-product-form";

export default function EditProductForm({
  productId,
}: {
  productId: string;
}) {
  return <AddProductForm productId={productId} />;
}
