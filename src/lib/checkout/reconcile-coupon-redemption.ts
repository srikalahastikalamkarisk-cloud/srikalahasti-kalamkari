import "server-only";

import { prisma } from "@/lib/prisma";
import type { CouponRedemptionResult } from "./redeem-coupon";
import { redeemCoupon } from "./redeem-coupon";

/** Reconcile coupon accounting after a payment is already known to be PAID. */
export async function reconcileCouponRedemption(
  orderId: string
): Promise<CouponRedemptionResult | "ORDER_NOT_PAID"> {
  try {
    return await prisma.$transaction(async tx => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM \`Order\` WHERE id = ${orderId} FOR UPDATE
      `;
      if (rows.length !== 1) return "REVIEW_REQUIRED" as const;

      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { paymentStatus: true, couponCode: true },
      });
      if (!order || order.paymentStatus !== "PAID") {
        return "ORDER_NOT_PAID" as const;
      }

      return redeemCoupon(tx, {
        orderId,
        couponCode: order.couponCode,
      });
    }, {
      isolationLevel: "ReadCommitted",
      maxWait: 10000,
      timeout: 20000,
    });
  } catch (error) {
    // Payment has already been committed. A coupon accounting failure must
    // never change the successful payment state; a later callback can retry.
    console.error("Paid order coupon reconciliation failed:", error);
    return "REVIEW_REQUIRED";
  }
}
