import type { Metadata } from "next";
import { Suspense, cache } from "react";
import { notFound } from "next/navigation";
import PremiumHeader from "@/components/storefront-header";
import PremiumFooter from "@/components/premium-footer";
import ShopCatalog from "@/components/shop-catalog";
import { getPublicStoreSettings } from "@/lib/public-store-settings";
import { prisma } from "@/lib/prisma";
import { getStorefrontCatalogPage, getStorefrontCategoryProducts } from "@/lib/storefront-products";
import { BreadcrumbJsonLd } from "@/components/seo-jsonld";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ category: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const siteUrl = "https://srikalahastikalamkari.in";

const getCategory = cache(async (slug: string) => {
  const category = await prisma.category.findFirst({
    where: { slug, isActive: true },
    select: { id: true, parentId: true, name: true, slug: true },
  });
  if (!category) return null;

  const allCategories = await prisma.category.findMany({
    select: { id: true, parentId: true, name: true, slug: true, image: true, isActive: true },
  });
  const byId = new Map(allCategories.map(item => [item.id, item]));
  const chainFor = (item: typeof allCategories[number]) => {
    const chain: typeof allCategories = [];
    const visited = new Set<string>([item.id]);
    let parentId = item.parentId;
    while (parentId) {
      if (visited.has(parentId)) return null;
      visited.add(parentId);
      const parent = byId.get(parentId);
      if (!parent?.isActive) return null;
      chain.push(parent);
      parentId = parent.parentId;
    }
    return chain;
  };
  const ownRecord = byId.get(category.id);
  if (!ownRecord || !chainFor(ownRecord)) return null;

  const descendants = allCategories
    .filter(item => item.id !== category.id && item.isActive && chainFor(item)?.some(parent => parent.id === category.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ id, name, slug: childSlug, image }) => ({ id, name, slug: childSlug, image }));
  return { ...category, children: descendants };
});

export async function generateMetadata({
  params,
  searchParams,
}: Props): Promise<Metadata> {
  const { category: slug } = await params;
  const query = await searchParams;
  const category = await getCategory(slug);
  if (!category) return { title: "Collection Not Found | Srikalahasti Kalamkari", robots: { index: false, follow: false } };
  const products = await getStorefrontCategoryProducts(slug);
  const hasProducts = products.length > 0;
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

export default async function CategoryPage({ params, searchParams }: Props) {
  const { category: slug } = await params;
  const query = await searchParams;
  const subcategorySlug = typeof query.subcategory === "string" ? query.subcategory : undefined;
  const searchTerm = typeof query.q === "string" ? query.q : undefined;
  const category = await getCategory(slug);

  if (!category) notFound();

  const showSubcategoryBrowser = category.children.length > 0 && !subcategorySlug && !searchTerm;
  const catalog = showSubcategoryBrowser
    ? { products: [], total: 0 }
    : await getStorefrontCatalogPage({
        categorySlug: slug,
        subcategorySlug,
        query: searchTerm,
        page: 1,
        pageSize: 12,
      });

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
          <ShopCatalog whatsappNumber={(await getPublicStoreSettings())?.whatsappNumber}
            products={catalog.products}
            totalProducts={catalog.total}
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
