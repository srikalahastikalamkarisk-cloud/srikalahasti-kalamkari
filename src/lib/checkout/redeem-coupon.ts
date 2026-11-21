import "server-only";

import type { Prisma } from "@/generated/prisma/client";

export type CouponRedemptionResult =
  | "NOT_APPLICABLE"
  | "REDEEMED"
  | "ALREADY_REDEEMED"
  | "REVIEW_REQUIRED";

/**
 * Redeems only a reservation belonging to this order. Call from a transaction
 * after verified payment has been committed; this operation is idempotent.
 */
export async function redeemCoupon(
  tx: Prisma.TransactionClient,
  input: { orderId: string; couponCode: string | null }
): Promise<CouponRedemptionResult> {
  if (!input.couponCode) return "NOT_APPLICABLE";

  const reservation = await tx.couponReservation.findUnique({
    where: { orderId: input.orderId },
  });

  if (
    !reservation ||
    reservation.couponCode !== input.couponCode
  ) {
    return "REVIEW_REQUIRED";
  }

  if (reservation.status === "REDEEMED") {
    return "ALREADY_REDEEMED";
  }

  if (
    reservation.status !== "RESERVED" &&
    reservation.status !== "REVIEW_REQUIRED"
  ) {
    return "REVIEW_REQUIRED";
  }

  // Serialize all redemptions for this coupon. The usage count and reservation
  // transition are committed together, so duplicate callbacks cannot double count.
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM \`Coupon\`
    WHERE id = ${reservation.couponId}
    FOR UPDATE
  `;

  if (locked.length !== 1) {
    await tx.couponReservation.update({
      where: { id: reservation.id },
      data: { status: "REVIEW_REQUIRED", finalizedAt: new Date() },
    });
    return "REVIEW_REQUIRED";
  }

  const coupon = await tx.coupon.findUnique({
    where: { id: reservation.couponId },
    select: { id: true, code: true, usageLimit: true, usedCount: true },
  });

  if (!coupon || coupon.code !== input.couponCode) {
    await tx.couponReservation.update({
      where: { id: reservation.id },
      data: { status: "REVIEW_REQUIRED", finalizedAt: new Date() },
    });
    return "REVIEW_REQUIRED";
  }

  const increment = await tx.coupon.updateMany({
    where: {
      id: coupon.id,
      code: input.couponCode,
      OR: [
        { usageLimit: null },
        { usedCount: { lt: coupon.usageLimit ?? 0 } },
      ],
    },
    data: { usedCount: { increment: 1 } },
  });

  if (increment.count !== 1) {
    await tx.couponReservation.update({
      where: { id: reservation.id },
      data: { status: "REVIEW_REQUIRED", finalizedAt: new Date() },
    });
    return "REVIEW_REQUIRED";
  }

  await tx.couponReservation.update({
    where: { id: reservation.id },
    data: { status: "REDEEMED", finalizedAt: new Date() },
  });

  return "REDEEMED";
}
