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
