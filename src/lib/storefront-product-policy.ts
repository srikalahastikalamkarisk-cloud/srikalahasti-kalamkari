import type { StorefrontProduct } from "@/lib/storefront-products";

export function storefrontImageList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const safe = value.filter((item): item is string => typeof item === "string" && item.length <= 500 &&
    (item.startsWith("/uploads/products/") || item.startsWith("/api/media/products/") || item.startsWith("/images/")) &&
    !item.includes("..") && !/[\\?#\u0000-\u001f]/.test(item));
  return [...new Set(safe)].slice(0, 20);
}

export function selectRelatedProducts(product: StorefrontProduct, products: StorefrontProduct[], limit = 10) {
  const unique = new Map<string, StorefrontProduct>();
  for (const candidate of products) if (candidate.id !== product.id) unique.set(candidate.id, candidate);
  const relatedness = (candidate: StorefrontProduct) => {
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

export function hasPurchasableInventory(product: Pick<StorefrontProduct, "availabilityStatus" | "stock" | "price" | "pricingMode" | "pricePerMeter" | "variants">): boolean {
  if (product.availabilityStatus !== "IN_STOCK") return false;
  if (product.variants.length > 0) {
    return product.variants.some(variant => variant.isActive && variant.stock > 0 && variant.price != null && variant.price > 0);
  }
  if (product.pricingMode === "LENGTH_OPTIONS") return false;
  const price = product.pricingMode === "PER_METER" ? product.pricePerMeter : product.price;
  return product.stock > 0 && price != null && price > 0;
}

export function productAvailabilityLabel(product: Parameters<typeof hasPurchasableInventory>[0]): "Coming Soon" | "In Stock" | "Out of Stock" {
  if (product.availabilityStatus === "COMING_SOON") return "Coming Soon";
  return hasPurchasableInventory(product) ? "In Stock" : "Out of Stock";
}
