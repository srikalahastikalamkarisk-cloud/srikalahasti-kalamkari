import type { StorefrontProduct } from "@/lib/storefront-products";

export function storefrontImageList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const safe = value.filter((item): item is string => typeof item === "string" && item.length <= 500 &&
    (item.startsWith("/uploads/products/") || item.startsWith("/api/media/products/") || item.startsWith("/images/")) &&
    !item.includes("..") && !/[\\?#\u0000-\u001f]/.test(item));
  return [...new Set(safe)].slice(0, 20);
}

export function storefrontSearchTerms(value: string): string[] {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const aliases: Record<string, string[]> = {
    "pure silk kanchipattu": ["pure silk kanchipattu", "pure silk kanchipuram", "pure silk kanchipattu pattu"],
    "semi silk kanchipattu": ["semi silk kanchipattu", "semi silk kanchi", "semi silk kanchipuram"],
    pochampally: ["pochampally", "pochampalli"],
    cotton: ["cotton"], linen: ["linen"],
  };
  return aliases[normalized] || [normalized];
}

type RelatedProduct = {
  id: string;
  categoryId: string;
  brand?: string | null;
  fabricMaterial?: string | null;
};

export function selectRelatedProducts<T extends RelatedProduct>(product: RelatedProduct, products: T[], limit = 10): T[] {
  const unique = new Map<string, T>();
  for (const candidate of products) if (candidate.id !== product.id) unique.set(candidate.id, candidate);
  const relatedness = (candidate: RelatedProduct) => {
    if (candidate.categoryId === product.categoryId) return 3;
    if (candidate.fabricMaterial && product.fabricMaterial && candidate.fabricMaterial.toLowerCase() === product.fabricMaterial.toLowerCase()) return 2;
    if (candidate.brand && product.brand && candidate.brand.toLowerCase() === product.brand.toLowerCase()) return 1;
    return 0;
  };
  return [...unique.values()].sort((a,b)=>relatedness(b)-relatedness(a)).slice(0,Math.max(0,limit));
}


export function belongsToCategory(product: Pick<StorefrontProduct, "categoryId" | "categorySlug" | "categoryAncestorIds" | "categoryAncestorSlugs">, categoryId?: string, categorySlug?: string): boolean {
  const matchesId = Boolean(categoryId && (product.categoryId === categoryId || product.categoryAncestorIds.includes(categoryId)));
  const matchesSlug = Boolean(categorySlug && (product.categorySlug === categorySlug || product.categoryAncestorSlugs.includes(categorySlug)));
  return matchesId || matchesSlug;
}

type PurchasableProduct = Pick<StorefrontProduct, "availabilityStatus" | "stock" | "price" | "pricingMode" | "pricePerMeter"> & {
  variants: readonly Pick<StorefrontProduct["variants"][number], "isActive" | "stock" | "price">[];
};

export function hasPurchasableInventory(product: PurchasableProduct): boolean {
  if (product.availabilityStatus !== "IN_STOCK") return false;
  if (product.variants.length > 0) {
    return product.variants.some(variant => variant.isActive && variant.stock > 0 && variant.price != null && variant.price > 0);
  }
  if (product.pricingMode === "LENGTH_OPTIONS") return false;
  const price = product.pricingMode === "PER_METER" ? product.pricePerMeter : product.price;
  return product.stock > 0 && price != null && price > 0;
}

export function productAvailabilityLabel(product: PurchasableProduct): "Coming Soon" | "In Stock" | "Out of Stock" {
  if (product.availabilityStatus === "COMING_SOON") return "Coming Soon";
  return hasPurchasableInventory(product) ? "In Stock" : "Out of Stock";
}
