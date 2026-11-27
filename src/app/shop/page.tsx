import type { Metadata } from "next";
import { Suspense } from "react";
import PremiumHeader from "@/components/storefront-header";
import PremiumFooter from "@/components/premium-footer";
import ShopCatalog from "@/components/shop-catalog";
import { getPublicStoreSettings } from "@/lib/public-store-settings";
import { prisma } from "@/lib/prisma";
import { getStorefrontCatalogPage } from "@/lib/storefront-products";

export const dynamic = "force-dynamic";

const siteUrl = "https://srikalahastikalamkari.in";
export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> {
  const query = await searchParams;
  const title = "Shop Srikalahasti Kalamkari Sarees & Textiles";
  const description = "Browse currently available Srikalahasti Kalamkari sarees, textiles and handcrafted pieces. Check each listing for its materials, technique, price and availability.";
  return { title, description, alternates: { canonical: `${siteUrl}/shop` }, ...(query.q ? { robots: { index: false, follow: true } } : {}), openGraph: { title, description, url: `${siteUrl}/shop`, type: "website" }, twitter: { card: "summary", title, description } };
}
export default async function ShopPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const q = typeof query.q === "string" ? query.q : undefined;
  const requestedCategory = typeof query.category === "string" ? query.category : undefined;
  const requestedSubcategory = typeof query.subcategory === "string" ? query.subcategory : undefined;
  const [catalog, categories] = await Promise.all([
    getStorefrontCatalogPage({ query: q, categorySlug: requestedCategory, subcategorySlug: requestedSubcategory, page: 1, pageSize: 12 }),
    prisma.category.findMany({
    where: { isActive: true, parentId: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      children: {
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          slug: true,
          image: true,
        },
      },
    },
  }),
  ]);

  return <><PremiumHeader/><main id="main-content"><Suspense fallback={<div style={{minHeight:500,padding:48}}>Loading collection…</div>}><ShopCatalog whatsappNumber={(await getPublicStoreSettings())?.whatsappNumber} categories={categories} products={catalog.products} totalProducts={catalog.total}/></Suspense></main><PremiumFooter/></>;
}
