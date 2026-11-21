import "server-only";

import { prisma } from "@/lib/prisma";
import { deductOrderInventory } from "@/lib/payments/deduct-order-inventory";

export async function reconcilePaidInventory(
  orderId: string
): Promise<"DEDUCTED" | "ALREADY_DEDUCTED" | "REVIEW_REQUIRED"> {
  try {
    return await prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM \`Order\`
      WHERE id = ${orderId}
      FOR UPDATE
    `;

    if (rows.length !== 1) {
      return "REVIEW_REQUIRED";
    }

    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        orderStatus: true,
        paymentStatus: true,
        inventoryStatus: true,
      },
    });

    if (
      !order ||
      order.orderStatus === "CANCELLED" ||
      order.paymentStatus !== "PAID"
    ) {
      return "REVIEW_REQUIRED";
    }

    if (order.inventoryStatus === "LEGACY_PAID") {
      return "REVIEW_REQUIRED";
    }

    return deductOrderInventory(tx, orderId);
  }, {
    isolationLevel: "ReadCommitted",
    maxWait: 10000,
    timeout: 20000,
    });
  } catch (error) {
    console.error(
      "Inventory deduction transaction failed:",
      error instanceof Error ? error.name : "UnknownError"
    );

    // Never overwrite a successfully deducted or legacy order.
    // A separate transaction persists the manual-review state.
    await prisma.$transaction(async tx => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM \`Order\`
        WHERE id = ${orderId}
        FOR UPDATE
      `;

      if (rows.length !== 1) {
        throw new Error("INVENTORY_REVIEW_ORDER_NOT_FOUND");
      }

      await tx.order.updateMany({
        where: {
          id: orderId,
          paymentStatus: "PAID",
          inventoryStatus: "PENDING",
          inventoryDeductedAt: null,
        },
        data: {
          inventoryStatus: "REVIEW_REQUIRED",
        },
      });
    }, {
      isolationLevel: "ReadCommitted",
      maxWait: 10000,
      timeout: 20000,
    });

    return "REVIEW_REQUIRED";
  }
}
