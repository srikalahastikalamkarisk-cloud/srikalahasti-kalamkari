import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { synchronizeAvailability } from "@/lib/admin/inventory-policy";

type Transaction = Prisma.TransactionClient;
export type Availability = "IN_STOCK" | "OUT_OF_STOCK" | "COMING_SOON";

export async function recordInventoryMovement(
  tx: Transaction,
  input: {
    productId: string;
    productName: string;
    productSku: string | null;
    movementType: string;
    quantityChange: number;
    quantityBefore: number;
    quantityAfter: number;
    note?: string | null;
    referenceId?: string | null;
    performedBy?: string | null;
  }
) {
  await tx.inventoryMovement.create({ data: input });
}

export async function setProductInventory(
  tx: Transaction,
  input: {
    productId: string;
    stock: number;
    availabilityStatus?: Availability;
    note?: string;
    performedBy?: string;
  }
) {
  if (!Number.isSafeInteger(input.stock) || input.stock < 0 || input.stock > 2147483647) {
    throw new Error("INVALID_STOCK");
  }

  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM Product WHERE id = ${input.productId} FOR UPDATE
  `;
  if (rows.length !== 1) throw new Error("PRODUCT_NOT_FOUND");

  const product = await tx.product.findUnique({
    where: { id: input.productId },
    select: { id: true, name: true, sku: true, stock: true, availabilityStatus: true },
  });
  if (!product) throw new Error("PRODUCT_NOT_FOUND");

  const currentStatus = product.availabilityStatus as Availability;
  const nextStatus = synchronizeAvailability(
    input.stock,
    currentStatus,
    input.availabilityStatus
  );

  await tx.product.update({
    where: { id: product.id },
    data: { stock: input.stock, availabilityStatus: nextStatus },
  });

  const change = input.stock - product.stock;
  if (change !== 0 || currentStatus !== nextStatus) {
    await recordInventoryMovement(tx, {
      productId: product.id,
      productName: product.name,
      productSku: product.sku,
      movementType: change === 0 ? "STATUS_CHANGE" : "ADJUSTMENT",
      quantityChange: change,
      quantityBefore: product.stock,
      quantityAfter: input.stock,
      note: input.note?.trim() || null,
      performedBy: input.performedBy || null,
    });
  }

  return {
    id: product.id,
    previousStock: product.stock,
    stock: input.stock,
    previousAvailabilityStatus: currentStatus,
    availabilityStatus: nextStatus,
    changed: change !== 0 || currentStatus !== nextStatus,
  };
}
