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
import { BreadcrumbJsonLd, SeoJsonLd } from "@/components/seo-jsonld";

const siteUrl = "https://srikalahastikalamkari.in";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: Props): Promise<Metadata> {
  const { id } = await params;
  const product = await getStorefrontProduct(id);

  if (!product) return { title: "Product Not Found | Srikalahasti Kalamkari", robots: { index: false, follow: false } };
  const canonical = `${siteUrl}/product/${encodeURIComponent(product.id)}`;
  const description = (product.shortDescription || product.description || `Explore ${product.name} from Srikalahasti Kalamkari.`).replace(/\s+/g, " ").trim().slice(0, 300);
  const images = product.images.length ? product.images.map(image => image.startsWith("/") ? `${siteUrl}${image}` : image) : undefined;

  return {
    title: `${product.name} | Srikalahasti Kalamkari`,
    description,
    alternates: { canonical },
    openGraph: { title: `${product.name} | Srikalahasti Kalamkari`, description, url: canonical, type: "website", ...(images ? { images: images.map(url => ({ url, alt: product.name })) } : {}) },
    twitter: { card: "summary_large_image", title: product.name, description, ...(images ? { images } : {}) },
  };
}

function productStructuredData(product: NonNullable<Awaited<ReturnType<typeof getStorefrontProduct>>>) {
  const canonical = `${siteUrl}/product/${encodeURIComponent(product.id)}`;
  const images = product.images.map(image => image.startsWith("/") ? `${siteUrl}${image}` : image);
  const price = product.pricingMode === "PER_METER" ? product.pricePerMeter : product.price;
  const hasOffer = typeof price === "number" && Number.isFinite(price) && price > 0 && product.availabilityStatus !== "COMING_SOON" && product.pricingMode !== "LENGTH_OPTIONS" && product.variants.length === 0;
  const inStock = product.availabilityStatus === "IN_STOCK" && product.stock > 0;
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.shortDescription || product.description || undefined,
    sku: product.id,
    category: product.categoryPath.join(" / "),
    ...(product.brand ? { brand: { "@type": "Brand", name: product.brand } } : {}),
    ...(product.fabricMaterial ? { material: product.fabricMaterial } : {}),
    ...(images.length ? { image: images } : {}),
    url: canonical,
    ...(hasOffer ? { offers: {
      "@type": "Offer",
      url: canonical,
      priceCurrency: "INR",
      price: price!.toFixed(2),
      availability: `https://schema.org/${inStock ? "InStock" : "OutOfStock"}`,
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@type": "OnlineStore", name: "Srikalahasti Kalamkari", url: `${siteUrl}/` },
    } } : {}),
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
        <SeoJsonLd data={productStructuredData(product)} />
        <BreadcrumbJsonLd items={[{ name: "Home", url: `${siteUrl}/` }, { name: product.categoryPath[0] || product.category, url: `${siteUrl}/${encodeURIComponent(product.categoryParentSlug || product.categorySlug)}` }, { name: product.name, url: `${siteUrl}/product/${encodeURIComponent(product.id)}` }]} />
        <ProductDetail key={product.id} product={product} relatedProducts={relatedProducts} />
      </main>
      <PremiumFooter />
    </>
  );
}
