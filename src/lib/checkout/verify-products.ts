import "server-only";

import { prisma } from "@/lib/prisma";
import type { CheckoutRequest } from "./order-validation";

export type VerifiedCheckoutItem = {
  productId: string;
  variantId: string | null;
  productName: string;
  variantLabel: string | null;
  variantSnapshot: Record<string, string> | null;
  productImage: string | null;
  productSku: string | null;
  quantity: number;
  unitPricePaise: number;
  totalPricePaise: number;
};

export class CheckoutValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckoutValidationError";
  }
}

function firstImage(value: unknown): string | null {
  if (!Array.isArray(value)) return null;

  const image = value.find(
    (item): item is string =>
      typeof item === "string" &&
      item.length > 0 &&
      item.length <= 191 &&
      (item.startsWith("/uploads/products/") ||
        item.startsWith("/api/media/products/") ||
        item.startsWith("/images/"))
  );

  return image ?? null;
}

export async function verifyCheckoutProducts(
  items: CheckoutRequest["items"]
): Promise<{
  items: VerifiedCheckoutItem[];
  subtotalPaise: number;
}> {
  const products = await prisma.product.findMany({
    where: {
      id: { in: items.map(item => item.productId) },
    },
    select: {
      id: true,
      name: true,
      sku: true,
      images: true,
      price: true,
      pricePerMeter: true,
      stock: true,
      isActive: true,
      availabilityStatus: true,
      pricingMode: true,
      variants: {
        select: {
          id: true,
          productId: true,
          isActive: true,
          price: true,
          stock: true,
          lengthMeters: true,
          colorName: true,
          size: true,
          sku: true,
          attributes: true,
        },
      },
    },
  });

  const productMap = new Map(
    products.map(product => [product.id, product])
  );

  const verified: VerifiedCheckoutItem[] = [];
  const requestedStock = new Map<string, number>();

  for (const item of items) {
    const product = productMap.get(item.productId);

    if (!product || !product.isActive) {
      throw new CheckoutValidationError(
        "A selected product is no longer available."
      );
    }

    if (product.availabilityStatus !== "IN_STOCK") {
      throw new CheckoutValidationError(
        product.availabilityStatus === "COMING_SOON"
          ? `${product.name} is coming soon and cannot be purchased yet.`
          : `${product.name} is currently out of stock.`
      );
    }

    const hasVariants = product.variants.length > 0;
    const requiresVariant = hasVariants || product.pricingMode === "LENGTH_OPTIONS";

    if (requiresVariant && !item.variantId) {
      throw new CheckoutValidationError(
        `${product.name} requires a valid option selection.`
      );
    }

    if (!requiresVariant && item.variantId) {
      throw new CheckoutValidationError(
        `${product.name} does not support the selected option.`
      );
    }

    const variant = item.variantId
      ? product.variants.find(v => v.id === item.variantId)
      : null;

    if (item.variantId && (
      !variant ||
      !variant.isActive ||
      variant.productId !== product.id
    )) {
      throw new CheckoutValidationError(
        `${product.name} has an unavailable option.`
      );
    }

    if (requiresVariant && !variant) {
      throw new CheckoutValidationError(
        `${product.name} requires a configured option.`
      );
    }

    const stockKey = JSON.stringify([
      product.id,
      variant?.id ?? null,
    ]);

    const totalRequested =
      (requestedStock.get(stockKey) ?? 0) + item.quantity;

    requestedStock.set(stockKey, totalRequested);

    const availableStock = variant
      ? variant.stock
      : product.stock;

    if (availableStock < totalRequested) {
      throw new CheckoutValidationError(
        `${product.name} has insufficient stock for the selected option.`
      );
    }

    const price = variant
      ? Number(variant.price)
      : product.pricingMode === "PER_METER"
        ? Number(product.pricePerMeter)
        : Number(product.price);
    const unitPricePaise = Math.round(price * 100);

    if (
      !Number.isSafeInteger(unitPricePaise) ||
      unitPricePaise <= 0
    ) {
      throw new CheckoutValidationError(
        `${product.name} has an invalid price.`
      );
    }

    const totalPricePaise = unitPricePaise * item.quantity;

    if (!Number.isSafeInteger(totalPricePaise)) {
      throw new CheckoutValidationError(
        "Order amount exceeds supported limits."
      );
    }

    verified.push({
      productId: product.id,
      variantId: variant?.id ?? null,
      productName: product.name,
      variantLabel: variant
        ? variant.attributes && typeof variant.attributes === "object" && !Array.isArray(variant.attributes)
          ? Object.entries(variant.attributes as Record<string, string>).map(([name, value]) => `${name}: ${value}`).join(" · ")
          : variant.lengthMeters != null
          ? `${Number(variant.lengthMeters)}m`
          : [variant.colorName, variant.size].filter(Boolean).join(" · ") || null
        : product.pricingMode === "PER_METER" ? "Price per meter" : null,
      variantSnapshot: variant
        ? variant.attributes && typeof variant.attributes === "object" && !Array.isArray(variant.attributes)
          ? variant.attributes as Record<string, string>
          : Object.fromEntries([
              ...(variant.lengthMeters != null ? [["Length", `${Number(variant.lengthMeters)}m`]] : []),
              ...(variant.colorName ? [["Color", variant.colorName]] : []),
              ...(variant.size ? [["Size", variant.size]] : []),
            ])
        : product.pricingMode === "PER_METER" ? { Unit: "meter" } : null,
      productImage: firstImage(product.images),
      productSku: variant?.sku ?? product.sku,
      quantity: item.quantity,
      unitPricePaise,
      totalPricePaise,
    });
  }

  const subtotalPaise = verified.reduce(
    (sum, item) => sum + item.totalPricePaise,
    0
  );

  if (
    !Number.isSafeInteger(subtotalPaise) ||
    subtotalPaise <= 0 ||
    subtotalPaise > 9999999999
  ) {
    throw new CheckoutValidationError(
      "Invalid checkout subtotal."
    );
  }

  return { items: verified, subtotalPaise };
}
