import "server-only";
import { prisma } from "@/lib/prisma";
import { storefrontImageList } from "@/lib/storefront-product-policy";
import { SHIPPING_AMOUNT_PAISE } from "@/lib/checkout/shipping-policy";
export { selectRelatedProducts, storefrontImageList } from "@/lib/storefront-product-policy";

export type StorefrontVariant = {
  id: string;
  sku: string | null;
  colorName: string | null;
  colorHex: string | null;
  size: string | null;
  lengthMeters: number | null;
  attributes: Record<string, string> | null;
  imageUrl: string | null;
  price: number | null;
  originalPrice: number | null;
  stock: number;
  isActive: boolean;
};

export type StorefrontProduct = {
  id: string;
  name: string;
  slug: string;
  category: string;
  categoryPath: string[];
  categoryId: string;
  categorySlug: string;
  categoryParentSlug?: string | null;
  categoryAncestorIds: string[];
  categoryAncestorSlugs: string[];
  price: number;
  originalPrice?: number;
  image: string;
  images: string[];
  stock: number;
  availabilityStatus: "IN_STOCK" | "OUT_OF_STOCK" | "COMING_SOON";
  isFeatured: boolean;
  isNewArrival: boolean;
  pricingMode: string;
  pricePerMeter: number | null;
  allowCOD: boolean;
  freeShipping: boolean;
  allowEnquiry: boolean;
  description: string;
  shortDescription: string;
  brand: string | null;
  fabricMaterial: string | null;
  length: string | null;
  width: string | null;
  washCare: string | null;
  specifications: unknown;
  showColors: boolean;
  colors: unknown;
  showSizes: boolean;
  sizes: unknown;
  showMeters: boolean;
  meterOptions: unknown;
  showSpecifications: boolean;
  showFabricMaterial: boolean;
  showLength: boolean;
  showWidth: boolean;
  showWashCare: boolean;
  variants: StorefrontVariant[];
};

function normalizeAvailabilityStatus(value: string | null): StorefrontProduct["availabilityStatus"] {
  if (value === "IN_STOCK" || value === "OUT_OF_STOCK" || value === "COMING_SOON") return value;
  return "OUT_OF_STOCK";
}

export async function getStorefrontProducts(): Promise<StorefrontProduct[]> {
  const [rows, categories] = await Promise.all([prisma.product.findMany({
    where: { isActive: true, category: { isActive: true } },
    include: {
      category: { select: { id: true, name: true, slug: true, parent: { select: { name: true, slug: true } } } },
      variants: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    },
    orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
  }), prisma.category.findMany({
    select: { id: true, parentId: true, slug: true, isActive: true },
  })]);
  const categoryById = new Map(categories.map(category => [category.id, category]));
  const ancestorsFor = (categoryId: string) => {
    const ids: string[] = [];
    const slugs: string[] = [];
    let visible = true;
    const seen = new Set<string>();
    let parentId = categoryById.get(categoryId)?.parentId ?? null;
    while (parentId) {
      if (seen.has(parentId)) { visible = false; break; }
      seen.add(parentId);
      const parent = categoryById.get(parentId);
      if (!parent) { visible = false; break; }
      if (!parent.isActive) { visible = false; break; }
      ids.push(parent.id);
      slugs.push(parent.slug);
      parentId = parent.parentId;
    }
    return { ids, slugs, visible };
  };

  return rows.filter(product => ancestorsFor(product.category.id).visible).map(product => {
    const images = storefrontImageList(product.images);
    const ancestors = ancestorsFor(product.category.id);
    return {
      id: product.id, name: product.name, slug: product.slug,
      category: product.category.name, categoryPath: [...(product.category.parent ? [product.category.parent.name] : []), product.category.name], categoryId: product.category.id, categorySlug: product.category.slug, categoryParentSlug: product.category.parent?.slug ?? null,
      categoryAncestorIds: ancestors.ids, categoryAncestorSlugs: ancestors.slugs,
      price: Number(product.price), originalPrice: product.originalPrice == null ? undefined : Number(product.originalPrice),
      image: images[0] || "", images, stock: product.stock,
      availabilityStatus: normalizeAvailabilityStatus(product.availabilityStatus),
      isFeatured: product.isFeatured, isNewArrival: product.isNewArrival, pricingMode: product.pricingMode,
      pricePerMeter: product.pricePerMeter == null ? null : Number(product.pricePerMeter),
      allowCOD: product.allowCOD, freeShipping: product.freeShipping || SHIPPING_AMOUNT_PAISE === 0, allowEnquiry: product.allowEnquiry,
      description: product.description || "", shortDescription: product.shortDescription || "",
      brand: product.brand, fabricMaterial: product.showFabricMaterial ? product.fabricMaterial : null,
      length: product.showLength ? product.length : null, width: product.showWidth ? product.width : null,
      washCare: product.showWashCare ? product.washCare : null,
      specifications: product.showSpecifications ? product.specifications : null,
      showColors: product.showColors, colors: product.showColors ? product.colors : null,
      showSizes: product.showSizes, sizes: product.showSizes ? product.sizes : null,
      showMeters: product.showMeters, meterOptions: product.showMeters ? product.meterOptions : null,
      showSpecifications: product.showSpecifications, showFabricMaterial: product.showFabricMaterial,
      showLength: product.showLength, showWidth: product.showWidth, showWashCare: product.showWashCare,
      variants: product.variants.map(variant => ({
        id: variant.id, sku: variant.sku, colorName: variant.colorName, colorHex: variant.colorHex,
        size: variant.size, lengthMeters: variant.lengthMeters == null ? null : Number(variant.lengthMeters),
        attributes: variant.attributes && typeof variant.attributes === "object" && !Array.isArray(variant.attributes) ? variant.attributes as Record<string, string> : Object.fromEntries([
          ...(variant.lengthMeters != null ? [["Length", `${Number(variant.lengthMeters)}m`]] : []),
          ...(variant.colorName ? [["Color", variant.colorName]] : []),
          ...(variant.size ? [["Size", variant.size]] : []),
        ]),
        imageUrl: variant.imageUrl,
        price: variant.price == null ? null : Number(variant.price),
        originalPrice: variant.originalPrice == null ? null : Number(variant.originalPrice), stock: variant.stock, isActive: variant.isActive,
      })),
    };
  });
}

export async function getStorefrontProduct(id: string) {
  const products = await getStorefrontProducts();
  return products.find(product => product.id === id || product.slug === id) ?? null;
}

