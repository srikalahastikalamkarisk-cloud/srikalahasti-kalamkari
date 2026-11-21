import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import PremiumHeader from "@/components/storefront-header";
import PremiumFooter from "@/components/premium-footer";
import ShopCatalog from "@/components/shop-catalog";
import { prisma } from "@/lib/prisma";
import { getStorefrontProducts } from "@/lib/storefront-products";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ category: string }>;
};

async function getCategory(slug: string) {
  return prisma.category.findFirst({
    where: {
      slug,
      isActive: true,
      parentId: null,
    },
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
  });
}

export async function generateMetadata({
  params,
}: Props): Promise<Metadata> {
  const { category: slug } = await params;
  const category = await getCategory(slug);

  return {
    title: category
      ? `${category.name} | Srikalahasti Kalamkari`
      : "Collection Not Found | Srikalahasti Kalamkari",
  };
}

export default async function CategoryPage({ params }: Props) {
  const { category: slug } = await params;
  const category = await getCategory(slug);

  if (!category) notFound();

  const products = await getStorefrontProducts();

  const categories = await prisma.category.findMany({
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
  });

  return (
    <>
      <PremiumHeader />
      <main id="main-content">
        <Suspense fallback={
          <div style={{ minHeight: 500, padding: 48 }}>
            Loading collection…
          </div>
        }>
          <ShopCatalog
            products={products}
            categorySlug={category.slug}
            categoryName={category.name}
            subcategories={category.children}
            categories={categories}
          />
        </Suspense>
      </main>
      <PremiumFooter />
    </>
  );
}
