import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import PremiumHeader from "@/components/storefront-header";
import PremiumFooter from "@/components/premium-footer";
import ShopCatalog from "@/components/shop-catalog";
import { prisma } from "@/lib/prisma";
import { getStorefrontProducts } from "@/lib/storefront-products";
import { BreadcrumbJsonLd } from "@/components/seo-jsonld";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ category: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const siteUrl = "https://srikalahastikalamkari.in";

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
  searchParams,
}: Props): Promise<Metadata> {
  const { category: slug } = await params;
  const query = await searchParams;
  const category = await getCategory(slug);
  if (!category) return { title: "Collection Not Found | Srikalahasti Kalamkari", robots: { index: false, follow: false } };
  const products = await getStorefrontProducts();
  const hasProducts = products.some(product => product.categorySlug === slug || product.categoryParentSlug === slug);
  const canonical = `${siteUrl}/${encodeURIComponent(slug)}`;
  const description = `Explore ${category.name} from Srikalahasti Kalamkari. Browse currently available pieces and check each product page for materials, techniques and availability.`;

  return {
    title: `${category.name} | Srikalahasti Kalamkari`,
    description,
    alternates: { canonical },
    ...(query.q ? { robots: { index: false, follow: true } } : !hasProducts ? { robots: { index: false, follow: true } } : {}),
    openGraph: { title: `${category.name} | Srikalahasti Kalamkari`, description, url: canonical, type: "website" },
    twitter: { card: "summary", title: `${category.name} | Srikalahasti Kalamkari`, description },
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
        <BreadcrumbJsonLd items={[{ name: "Home", url: `${siteUrl}/` }, { name: category.name, url: `${siteUrl}/${encodeURIComponent(category.slug)}` }]} />
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
