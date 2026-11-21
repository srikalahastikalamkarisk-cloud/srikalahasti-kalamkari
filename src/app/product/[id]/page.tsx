import { notFound } from "next/navigation";
import type { Metadata } from "next";
import PremiumHeader from "@/components/storefront-header";
import PremiumFooter from "@/components/premium-footer";
import ProductDetail from "@/components/product-detail";
import {
  getStorefrontProduct,
  getStorefrontProducts,
  selectRelatedProducts,
} from "@/lib/storefront-products";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: Props): Promise<Metadata> {
  const { id } = await params;
  const product = await getStorefrontProduct(id);

  return {
    title: product
      ? `${product.name} | Srikalahasti Kalamkari`
      : "Product Not Found | Srikalahasti Kalamkari",
    description: product?.shortDescription ||
      product?.description ||
      "Explore handcrafted Kalamkari products.",
  };
}

export default async function ProductPage({ params }: Props) {
  const { id } = await params;

  const [product, products] = await Promise.all([
    getStorefrontProduct(id),
    getStorefrontProducts(),
  ]);

  if (!product) notFound();
  const relatedProducts = selectRelatedProducts(product, products.filter(item => item.id !== product.id));

  return (
    <>
      <PremiumHeader />
      <main id="main-content">
        <ProductDetail key={product.id} product={product} relatedProducts={relatedProducts} />
      </main>
      <PremiumFooter />
    </>
  );
}
