import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { storefrontImageList, storefrontSearchTerms } from "@/lib/storefront-product-policy";
import { restoreRequestedOrder } from "@/lib/storefront-ordering";
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

export type StorefrontCatalogProduct = Pick<StorefrontProduct,
  "id" | "name" | "categoryId" | "categorySlug" | "categoryAncestorIds" |
  "categoryAncestorSlugs" | "price" | "originalPrice" | "image" | "stock" |
  "availabilityStatus" | "pricingMode" | "pricePerMeter"
> & {
  variants: Pick<StorefrontVariant, "id" | "price" | "stock" | "isActive">[];
};

export type StorefrontCatalogQuery = {
  categorySlug?: string;
  subcategorySlug?: string;
  query?: string;
  minPrice?: number;
  maxPrice?: number;
  pricedOnly?: boolean;
  sort?: "featured" | "name" | "price-asc" | "price-desc";
  page?: number;
  pageSize?: number;
};

function normalizeAvailabilityStatus(value: string | null): StorefrontProduct["availabilityStatus"] {
  if (value === "IN_STOCK" || value === "OUT_OF_STOCK" || value === "COMING_SOON") return value;
  return "OUT_OF_STOCK";
}

/** A deliberately small card payload for the homepage's editorial rails. */
export const getHomepageStorefrontProducts = cache(async (): Promise<StorefrontProduct[]> => {
  const selectedRows = await prisma.product.findMany({
    where: { isActive: true, category: { isActive: true } },
    select: { id: true },
    orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
    take: 24,
  });
  const [rows, categories] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: selectedRows.map(product => product.id) } },
      select: {
        id: true, name: true, slug: true, price: true, originalPrice: true,
        stock: true, availabilityStatus: true, isFeatured: true,
        isNewArrival: true, pricingMode: true, pricePerMeter: true,
        allowCOD: true, freeShipping: true, allowEnquiry: true,
        images: true, categoryId: true, brand: true, fabricMaterial: true,
        category: { select: { id: true, name: true, slug: true, parent: { select: { id: true, name: true, slug: true } } } },
        variants: {
          where: { isActive: true },
          select: { id: true, sku: true, colorName: true, colorHex: true, size: true, lengthMeters: true, attributes: true, imageUrl: true, price: true, originalPrice: true, stock: true, isActive: true },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        },
      },
    }),
    prisma.category.findMany({ select: { id: true, parentId: true, slug: true, isActive: true } }),
  ]);
  const orderedRows = restoreRequestedOrder(rows, selectedRows.map(product => product.id));
  const categoryById = new Map(categories.map(category => [category.id, category]));
  const ancestorsFor = (categoryId: string) => {
    const ids: string[] = [];
    const slugs: string[] = [];
    const seen = new Set<string>();
    let parentId = categoryById.get(categoryId)?.parentId ?? null;
    while (parentId) {
      if (seen.has(parentId)) return { ids, slugs, visible: false };
      seen.add(parentId);
      const parent = categoryById.get(parentId);
      if (!parent || !parent.isActive) return { ids, slugs, visible: false };
      ids.push(parent.id);
      slugs.push(parent.slug);
      parentId = parent.parentId;
    }
    return { ids, slugs, visible: true };
  };
  return orderedRows.flatMap(product => {
    const ancestors = ancestorsFor(product.category.id);
    if (!ancestors.visible) return [];
    const images = storefrontImageList(product.images);
    return [{
      id: product.id, name: product.name, slug: product.slug,
      category: product.category.name,
      categoryPath: [...(product.category.parent ? [product.category.parent.name] : []), product.category.name],
      categoryId: product.category.id, categorySlug: product.category.slug,
      categoryParentSlug: product.category.parent?.slug ?? null,
      categoryAncestorIds: ancestors.ids, categoryAncestorSlugs: ancestors.slugs,
      price: Number(product.price), originalPrice: product.originalPrice == null ? undefined : Number(product.originalPrice),
      image: images[0] || "", images, stock: product.stock,
      availabilityStatus: normalizeAvailabilityStatus(product.availabilityStatus),
      isFeatured: product.isFeatured, isNewArrival: product.isNewArrival, pricingMode: product.pricingMode,
      pricePerMeter: product.pricePerMeter == null ? null : Number(product.pricePerMeter),
      allowCOD: product.allowCOD, freeShipping: product.freeShipping || SHIPPING_AMOUNT_PAISE === 0,
      allowEnquiry: product.allowEnquiry, description: "", shortDescription: "",
      brand: product.brand, fabricMaterial: product.fabricMaterial,
      length: null, width: null, washCare: null, specifications: null,
      showColors: false, colors: null, showSizes: false, sizes: null, showMeters: false, meterOptions: null,
      showSpecifications: false, showFabricMaterial: Boolean(product.fabricMaterial),
      showLength: false, showWidth: false, showWashCare: false,
      variants: product.variants.map(variant => ({
        id: variant.id, sku: variant.sku, colorName: variant.colorName, colorHex: variant.colorHex,
        size: variant.size, lengthMeters: variant.lengthMeters == null ? null : Number(variant.lengthMeters),
        attributes: variant.attributes && typeof variant.attributes === "object" && !Array.isArray(variant.attributes)
          ? variant.attributes as Record<string, string>
          : Object.fromEntries([
              ...(variant.lengthMeters != null ? [["Length", `${Number(variant.lengthMeters)}m`]] : []),
              ...(variant.colorName ? [["Color", variant.colorName]] : []),
              ...(variant.size ? [["Size", variant.size]] : []),
            ]),
        imageUrl: variant.imageUrl,
        price: variant.price == null ? null : Number(variant.price),
        originalPrice: variant.originalPrice == null ? null : Number(variant.originalPrice),
        stock: variant.stock, isActive: variant.isActive,
      })),
    } satisfies StorefrontProduct];
  });
});

/** Fetches just the matching products plus ancestors, for category storefronts. */
export const getStorefrontCategoryProducts = cache(async (slug: string): Promise<StorefrontCatalogProduct[]> => {
  return (await getStorefrontCatalogPage({ categorySlug: slug, pageSize: 24 })).products;
});

export const getStorefrontProducts = cache(async (productId?: string): Promise<StorefrontProduct[]> => {
  const [rows, categories] = await Promise.all([prisma.product.findMany({
    where: {
      isActive: true,
      category: { isActive: true },
      ...(productId !== undefined
        ? { OR: [{ id: productId }, { slug: productId }] }
        : {}),
    },
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
});

/** Fetch only products currently referenced by a customer's cart or wishlist. */
export const getStorefrontProductsByIds = cache(async (ids: string[]): Promise<StorefrontProduct[]> => {
  const uniqueIds = [...new Set(ids.map(String))].filter(id => id.length > 0).slice(0, 200);
  if (uniqueIds.length === 0) return [];
  const [rows, categories] = await Promise.all([prisma.product.findMany({
    where: { id: { in: uniqueIds }, isActive: true, category: { isActive: true } },
    include: {
      category: { select: { id: true, name: true, slug: true, parent: { select: { name: true, slug: true } } } },
      variants: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    },
  }), prisma.category.findMany({ select: { id: true, parentId: true, slug: true, isActive: true } })]);
  const categoryById = new Map(categories.map(category => [category.id, category]));
  const ancestorsFor = (categoryId: string) => {
    const ids: string[] = [];
    const slugs: string[] = [];
    const seen = new Set<string>();
    let parentId = categoryById.get(categoryId)?.parentId ?? null;
    while (parentId) {
      if (seen.has(parentId)) return { ids, slugs, visible: false };
      seen.add(parentId);
      const parent = categoryById.get(parentId);
      if (!parent || !parent.isActive) return { ids, slugs, visible: false };
      ids.push(parent.id);
      slugs.push(parent.slug);
      parentId = parent.parentId;
    }
    return { ids, slugs, visible: true };
  };
  return rows.filter(product => ancestorsFor(product.category.id).visible).map(product => {
    const images = storefrontImageList(product.images);
    const ancestors = ancestorsFor(product.category.id);
    return {
      id: product.id, name: product.name, slug: product.slug,
      category: product.category.name,
      categoryPath: [...(product.category.parent ? [product.category.parent.name] : []), product.category.name],
      categoryId: product.category.id, categorySlug: product.category.slug,
      categoryParentSlug: product.category.parent?.slug ?? null,
      categoryAncestorIds: ancestors.ids, categoryAncestorSlugs: ancestors.slugs,
      price: Number(product.price), originalPrice: product.originalPrice == null ? undefined : Number(product.originalPrice),
      image: images[0] || "", images, stock: product.stock,
      availabilityStatus: normalizeAvailabilityStatus(product.availabilityStatus),
      isFeatured: product.isFeatured, isNewArrival: product.isNewArrival, pricingMode: product.pricingMode,
      pricePerMeter: product.pricePerMeter == null ? null : Number(product.pricePerMeter),
      allowCOD: product.allowCOD, freeShipping: product.freeShipping || SHIPPING_AMOUNT_PAISE === 0,
      allowEnquiry: product.allowEnquiry,
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
        attributes: variant.attributes && typeof variant.attributes === "object" && !Array.isArray(variant.attributes)
          ? variant.attributes as Record<string, string>
          : Object.fromEntries([
              ...(variant.lengthMeters != null ? [["Length", `${Number(variant.lengthMeters)}m`]] : []),
              ...(variant.colorName ? [["Color", variant.colorName]] : []),
              ...(variant.size ? [["Size", variant.size]] : []),
            ]),
        imageUrl: variant.imageUrl,
        price: variant.price == null ? null : Number(variant.price),
        originalPrice: variant.originalPrice == null ? null : Number(variant.originalPrice),
        stock: variant.stock, isActive: variant.isActive,
      })),
    } satisfies StorefrontProduct;
  });
});

export const getStorefrontProduct = cache(async (id: string) => {
  const products = await getStorefrontProducts(id);
  return products.find(product => product.id === id || product.slug === id) ?? null;
});

/** A bounded, field-limited query for the public shop and collection pages. */
export const getStorefrontCatalogPage = cache(async (options: StorefrontCatalogQuery = {}) => {
  const categories = await prisma.category.findMany({
    select: { id: true, parentId: true, slug: true, isActive: true },
  });
  const categoryById = new Map(categories.map(category => [category.id, category]));
  const isVisibleCategory = (id: string) => {
    const visited = new Set<string>([id]);
    let parentId = categoryById.get(id)?.parentId ?? null;
    while (parentId) {
      if (visited.has(parentId)) return false;
      visited.add(parentId);
      const parent = categoryById.get(parentId);
      if (!parent?.isActive) return false;
      parentId = parent.parentId;
    }
    return Boolean(categoryById.get(id)?.isActive);
  };
  const visibleCategoryIds = categories.filter(category => isVisibleCategory(category.id)).map(category => category.id);
  const descendantsOf = (rootId: string) => {
    const descendants = new Set<string>([rootId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const category of categories) {
        if (category.isActive && category.parentId && descendants.has(category.parentId) && !descendants.has(category.id)) {
          descendants.add(category.id);
          changed = true;
        }
      }
    }
    return [...descendants].filter(id => isVisibleCategory(id));
  };
  let allowedCategoryIds = visibleCategoryIds;

  if (options.categorySlug) {
    const root = categories.find(category => category.slug === options.categorySlug && isVisibleCategory(category.id));
    if (!root) {
      allowedCategoryIds = [];
    } else {
      const descendants = descendantsOf(root.id);
      allowedCategoryIds = descendants;
      if (options.subcategorySlug) {
        const subcategory = categories.find(category => category.slug === options.subcategorySlug && descendants.includes(category.id));
        allowedCategoryIds = subcategory ? descendantsOf(subcategory.id) : [];
      }
    }
  } else if (options.subcategorySlug) {
    const subcategory = categories.find(category => category.slug === options.subcategorySlug && isVisibleCategory(category.id));
    allowedCategoryIds = subcategory ? descendantsOf(subcategory.id) : [];
  }

  const query = options.query?.trim().slice(0, 100) || "";
  const terms = query ? storefrontSearchTerms(query).filter(Boolean).slice(0, 3) : [];
  const minPrice = Number.isFinite(options.minPrice) ? Math.max(0, options.minPrice!) : undefined;
  const maxPrice = Number.isFinite(options.maxPrice) ? Math.max(0, options.maxPrice!) : undefined;
  const where = {
    isActive: true,
    category: { isActive: true, id: { in: allowedCategoryIds } },
    ...(terms.length ? {
      OR: terms.flatMap(term => [
        { name: { contains: term } },
        { category: { name: { contains: term } } },
      ]),
    } : {}),
    ...(minPrice !== undefined || maxPrice !== undefined || options.pricedOnly ? {
      price: {
        ...(options.pricedOnly || minPrice !== undefined || maxPrice !== undefined ? { gt: 0 } : {}),
        ...(minPrice !== undefined ? { gte: minPrice } : {}),
        ...(maxPrice !== undefined ? { lt: maxPrice } : {}),
      },
    } : {}),
  };
  const total = await prisma.product.count({ where });
  const pageSize = Math.min(24, Math.max(1, Math.floor(options.pageSize || 12)));
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pages, Math.max(1, Math.floor(options.page || 1)));
  const orderBy = options.sort === "name"
    ? [{ name: "asc" as const }, { id: "asc" as const }]
    : options.sort === "price-asc"
      ? [{ price: "asc" as const }, { id: "asc" as const }]
      : options.sort === "price-desc"
        ? [{ price: "desc" as const }, { id: "asc" as const }]
        : [{ isFeatured: "desc" as const }, { createdAt: "desc" as const }, { id: "asc" as const }];

  const rows = await prisma.product.findMany({
    where,
    select: {
      id: true, name: true, price: true, originalPrice: true, stock: true,
      availabilityStatus: true, pricingMode: true, pricePerMeter: true,
      images: true, isFeatured: true, categoryId: true,
      category: { select: { id: true, slug: true } },
      variants: {
        where: { isActive: true },
        select: { id: true, price: true, stock: true, isActive: true },
      },
    },
    orderBy,
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
  const products: StorefrontCatalogProduct[] = rows.map(product => {
    const ancestorIds: string[] = [];
    const ancestorSlugs: string[] = [];
    let parentId = categoryById.get(product.category.id)?.parentId ?? null;
    while (parentId) {
      const parent = categoryById.get(parentId);
      if (!parent) break;
      ancestorIds.push(parent.id);
      ancestorSlugs.push(parent.slug);
      parentId = parent.parentId;
    }
    const images = storefrontImageList(product.images);
    return {
      id: product.id,
      name: product.name,
      categoryId: product.categoryId,
      categorySlug: product.category.slug,
      categoryAncestorIds: ancestorIds,
      categoryAncestorSlugs: ancestorSlugs,
      price: Number(product.price),
      originalPrice: product.originalPrice == null ? undefined : Number(product.originalPrice),
      image: images[0] || "",
      stock: product.stock,
      availabilityStatus: normalizeAvailabilityStatus(product.availabilityStatus),
      pricingMode: product.pricingMode,
      pricePerMeter: product.pricePerMeter == null ? null : Number(product.pricePerMeter),
      variants: product.variants.map(variant => ({
        id: variant.id,
        price: variant.price == null ? null : Number(variant.price),
        stock: variant.stock,
        isActive: variant.isActive,
      })),
    };
  });

  return { products, total, page, pageSize, pages };
});
