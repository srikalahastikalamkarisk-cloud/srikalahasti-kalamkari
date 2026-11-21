import type { Metadata } from "next";
import { Suspense } from "react";
import PremiumHeader from "@/components/storefront-header";
import PremiumFooter from "@/components/premium-footer";
import ShopCatalog from "@/components/shop-catalog";
import { prisma } from "@/lib/prisma";
import { getStorefrontProducts } from "@/lib/storefront-products";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shop Handcrafted Kalamkari | Srikalahasti Kalamkari",
  description: "Explore Srikalahasti Kalamkari sarees, dupattas, fabrics, lehengas and more.",
};
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
