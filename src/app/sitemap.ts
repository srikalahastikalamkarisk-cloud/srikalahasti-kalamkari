import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { storefrontImageList } from "@/lib/storefront-product-policy";

export const dynamic = "force-dynamic";

const siteUrl = "https://srikalahastikalamkari.in";
const publicPages = ["", "shop", "about", "contact", "contact-info", "faq", "shipping-policy", "refund-policy"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [categories, products] = await Promise.all([
    prisma.category.findMany({
      where: {
        isActive: true,
        parentId: null,
        OR: [
          { products: { some: { isActive: true } } },
          { children: { some: { isActive: true, products: { some: { isActive: true } } } } },
        ],
      },
      select: { slug: true, updatedAt: true },
    }),
    prisma.product.findMany({
      where: { isActive: true, category: { isActive: true } },
      select: { id: true, images: true, updatedAt: true },
    }),
  ]);
  return [
    ...publicPages.map(path => ({ url: path ? `${siteUrl}/${path}` : `${siteUrl}/`, changeFrequency: path === "" ? "weekly" as const : "monthly" as const, priority: path === "" ? 1 : path === "shop" ? 0.9 : 0.5 })),
    ...categories.map(category => ({ url: `${siteUrl}/${encodeURIComponent(category.slug)}`, lastModified: category.updatedAt, changeFrequency: "weekly" as const, priority: 0.7 })),
    ...products.map(product => ({
      url: `${siteUrl}/product/${encodeURIComponent(product.id)}`,
      lastModified: product.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
      images: storefrontImageList(product.images).map(image => new URL(image, siteUrl).toString()),
    })),
  ];
}
