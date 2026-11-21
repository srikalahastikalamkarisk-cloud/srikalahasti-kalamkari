import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { recordInventoryMovement } from "@/lib/admin/inventory";

type Transaction = Prisma.TransactionClient;

export type InventoryResult =
  | "DEDUCTED"
  | "ALREADY_DEDUCTED"
  | "REVIEW_REQUIRED";

export async function deductOrderInventory(
  tx: Transaction,
  orderId: string
): Promise<InventoryResult> {
  // Caller must hold the Order row FOR UPDATE lock.
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      orderStatus: true,
      inventoryStatus: true,
      inventoryDeductedAt: true,
      items: {
        select: {
          productId: true,
          variantId: true,
          quantity: true,
        },
      },
    },
  });

  if (!order) {
    return "REVIEW_REQUIRED";
  }

  if (order.orderStatus === "CANCELLED") {
    return "REVIEW_REQUIRED";
  }

  if (
    order.inventoryStatus === "DEDUCTED" &&
    order.inventoryDeductedAt
  ) {
    return "ALREADY_DEDUCTED";
  }

  if (order.inventoryStatus !== "PENDING") {
    return "REVIEW_REQUIRED";
  }

  const quantities = new Map<string, number>();
  const variantQuantities = new Map<string, number>();
  const variantProducts = new Map<string, string>();

  for (const item of order.items) {
    if (!Number.isSafeInteger(item.quantity) ||
        item.quantity <= 0) {
      await tx.order.update({
        where: { id: orderId },
        data: { inventoryStatus: "REVIEW_REQUIRED" },
      });
      return "REVIEW_REQUIRED";
    }

    if (item.variantId) {
      const previousProduct = variantProducts.get(item.variantId);

      if (previousProduct && previousProduct !== item.productId) {
        await tx.order.update({
          where: { id: orderId },
          data: { inventoryStatus: "REVIEW_REQUIRED" },
        });
        return "REVIEW_REQUIRED";
      }

      variantProducts.set(item.variantId, item.productId);

      const totalVariant =
        (variantQuantities.get(item.variantId) ?? 0) + item.quantity;

      if (!Number.isSafeInteger(totalVariant)) {
        await tx.order.update({
          where: { id: orderId },
          data: { inventoryStatus: "REVIEW_REQUIRED" },
        });
        return "REVIEW_REQUIRED";
      }

      variantQuantities.set(item.variantId, totalVariant);
      continue;
    }

    const total =
      (quantities.get(item.productId) ?? 0) + item.quantity;

    if (!Number.isSafeInteger(total)) {
      await tx.order.update({
        where: { id: orderId },
        data: { inventoryStatus: "REVIEW_REQUIRED" },
      });
      return "REVIEW_REQUIRED";
    }

    quantities.set(item.productId, total);
  }

  if (quantities.size === 0 && variantQuantities.size === 0) {
    await tx.order.update({
      where: { id: orderId },
      data: { inventoryStatus: "REVIEW_REQUIRED" },
    });
    return "REVIEW_REQUIRED";
  }

  // Lock product rows in deterministic order.
  const productIds = [
    ...new Set([
      ...quantities.keys(),
      ...variantProducts.values(),
    ]),
  ].sort();

  // Acquire exclusive product locks in a stable order.
  // This prevents concurrent paid orders from reading
  // the same stock before deduction.
  for (const id of productIds) {
    await tx.$queryRaw`
      SELECT id FROM Product
      WHERE id = ${id}
      FOR UPDATE
    `;
  }

  const products = await tx.product.findMany({
    where: { id: { in: productIds } },
    select: {
      id: true,
      name: true,
      sku: true,
      stock: true,
      isActive: true,
      availabilityStatus: true,
      pricingMode: true,
    },
  });

  const productMap = new Map(
    products.map(product => [product.id, product])
  );

  const variantIds = [...variantQuantities.keys()].sort();

  for (const id of variantIds) {
    await tx.$queryRaw`
      SELECT id FROM ProductVariant
      WHERE id = ${id}
      FOR UPDATE
    `;
  }

  const variants = await tx.productVariant.findMany({
    where: { id: { in: variantIds } },
    select: {
      id: true,
      productId: true,
      sku: true,
      stock: true,
      isActive: true,
    },
  });

  const variantMap = new Map(
    variants.map(variant => [variant.id, variant])
  );

  const validVariants = variantIds.every(id => {
    const variant = variantMap.get(id);
    const product = variant
      ? productMap.get(variant.productId)
      : null;

    return Boolean(
      variant &&
      variant.isActive &&
      variant.productId === variantProducts.get(id) &&
      product &&
      product.isActive &&
      product.availabilityStatus === "IN_STOCK" &&
      variant.stock >= variantQuantities.get(id)!
    );
  });

  const valid = validVariants && productIds.every(id => {
    const product = productMap.get(id);
    return Boolean(
      product &&
      product.isActive &&
      product.availabilityStatus === "IN_STOCK" &&
      (
        !quantities.has(id) ||
        (
          (product.pricingMode === "FIXED" ||
            product.pricingMode === "PER_METER") &&
          product.stock >= quantities.get(id)!
        )
      )
    );
  });

  if (!valid) {
    await tx.order.update({
      where: { id: orderId },
      data: { inventoryStatus: "REVIEW_REQUIRED" },
    });
    return "REVIEW_REQUIRED";
  }

  for (const id of productIds) {
    if (!quantities.has(id)) continue;

    const quantity = quantities.get(id)!;
    const product = productMap.get(id)!;
    const nextStock = product.stock - quantity;

    const updated = await tx.product.updateMany({
      where: {
        id,
        stock: { gte: quantity },
        isActive: true,
        availabilityStatus: "IN_STOCK",
        pricingMode: { in: ["FIXED", "PER_METER"] },
      },
      data: {
        stock: { decrement: quantity },
        availabilityStatus: nextStock === 0
          ? "OUT_OF_STOCK"
          : "IN_STOCK",
      },
    });

    if (updated.count !== 1) {
      // Throw to roll back all preceding deductions.
      throw new Error(
        "INVENTORY_CONCURRENT_STOCK_CHANGE"
      );
    }

    await recordInventoryMovement(tx, {
      productId: id,
      productName: product.name,
      productSku: product.sku,
      movementType: "ORDER_DEDUCTION",
      quantityChange: -quantity,
      quantityBefore: product.stock,
      quantityAfter: nextStock,
      note: `Inventory deducted for paid order ${orderId}`,
      referenceId: orderId,
      performedBy: "SYSTEM",
    });
  }

  for (const id of variantIds) {
    const quantity = variantQuantities.get(id)!;
    const variant = variantMap.get(id)!;
    const product = productMap.get(variant.productId)!;
    const nextStock = variant.stock - quantity;

    const updated = await tx.productVariant.updateMany({
      where: {
        id,
        productId: variant.productId,
        isActive: true,
        stock: { gte: quantity },
      },
      data: {
        stock: { decrement: quantity },
      },
    });

    if (updated.count !== 1) {
      throw new Error("INVENTORY_CONCURRENT_STOCK_CHANGE");
    }

    await recordInventoryMovement(tx, {
      productId: variant.productId,
      productName: product.name,
      productSku: variant.sku ?? product.sku,
      movementType: "ORDER_DEDUCTION",
      quantityChange: -quantity,
      quantityBefore: variant.stock,
      quantityAfter: nextStock,
      note: `Variant ${id} inventory deducted for paid order ${orderId}`,
      referenceId: orderId,
      performedBy: "SYSTEM",
    });
  }

  // Parent stock is the sum of active variant stock. Recompute it inside the
  // same transaction while the parent product rows remain locked so catalog
  // availability cannot drift from the sellable variants.
  for (const productId of [...new Set(variantProducts.values())].sort()) {
    const aggregate = await tx.productVariant.aggregate({
      where: { productId, isActive: true },
      _sum: { stock: true },
    });
    const stock = aggregate._sum.stock ?? 0;
    const product = productMap.get(productId);
    if (!product || !Number.isSafeInteger(stock) || stock < 0) {
      throw new Error("INVENTORY_PARENT_STOCK_RECONCILIATION_FAILED");
    }

    const updated = await tx.product.updateMany({
      where: { id: productId, isActive: true },
      data: {
        stock,
        ...(product.availabilityStatus === "COMING_SOON"
          ? {}
          : { availabilityStatus: stock > 0 ? "IN_STOCK" : "OUT_OF_STOCK" }),
      },
    });
    if (updated.count !== 1) {
      throw new Error("INVENTORY_PARENT_STOCK_RECONCILIATION_FAILED");
    }
  }

  await tx.order.update({
    where: { id: orderId },
    data: {
      inventoryStatus: "DEDUCTED",
      inventoryDeductedAt: new Date(),
    },
  });

  return "DEDUCTED";
}
