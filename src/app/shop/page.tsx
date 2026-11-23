import type { Metadata } from "next";
import { Suspense } from "react";
import PremiumHeader from "@/components/storefront-header";
import PremiumFooter from "@/components/premium-footer";
import ShopCatalog from "@/components/shop-catalog";
import { prisma } from "@/lib/prisma";
import { getStorefrontProducts } from "@/lib/storefront-products";

export const dynamic = "force-dynamic";

const siteUrl = "https://srikalahastikalamkari.in";
export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> {
  const query = await searchParams;
  const title = "Shop Srikalahasti Kalamkari Sarees & Textiles";
  const description = "Browse currently available Srikalahasti Kalamkari sarees, textiles and handcrafted pieces. Check each listing for its materials, technique, price and availability.";
  return { title, description, alternates: { canonical: `${siteUrl}/shop` }, ...(query.q ? { robots: { index: false, follow: true } } : {}), openGraph: { title, description, url: `${siteUrl}/shop`, type: "website" }, twitter: { card: "summary", title, description } };
}
export default async function ShopPage() {
  const [products, categories] = await Promise.all([
    getStorefrontProducts(),
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

  return <><PremiumHeader/><main id="main-content"><Suspense fallback={<div style={{minHeight:500,padding:48}}>Loading collection…</div>}><ShopCatalog categories={categories} products={products}/></Suspense></main><PremiumFooter/></>;
}
