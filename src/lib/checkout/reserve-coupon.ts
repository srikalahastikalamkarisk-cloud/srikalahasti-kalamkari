import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { calculateCouponMath } from "./coupon-math";

export class CouponReservationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CouponReservationError";
  }
}

const RESERVATION_MINUTES = 30;

/**
 * Must be called inside a Prisma transaction.
 * Caller must ensure the Order and coupon amount are valid.
 *
 * Expiration is informational until payment reconciliation.
 */
export async function reserveCoupon(
  tx: Prisma.TransactionClient,
  input: {
    couponId: string;
    couponCode: string;
    orderId: string;
    subtotalPaise: number;
    shippingPaise: number;
    expectedDiscountPaise: number;
    expectedTotalPaise: number;
  }
): Promise<void> {
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM \`Coupon\`
    WHERE id = ${input.couponId}
    FOR UPDATE
  `;

  if (locked.length !== 1) {
    throw new CouponReservationError("Coupon no longer exists.");
  }

  const existing = await tx.couponReservation.findUnique({
    where: { orderId: input.orderId },
  });

  if (existing) {
    if (
      existing.couponId !== input.couponId ||
      existing.couponCode !== input.couponCode ||
      existing.status !== "RESERVED"
    ) {
      throw new CouponReservationError(
        "Existing coupon reservation requires review."
      );
    }

    return;
  }

  const coupon = await tx.coupon.findUnique({
    where: { id: input.couponId },
  });

  if (!coupon || coupon.code !== input.couponCode || !coupon.isActive) {
    throw new CouponReservationError(
      "Coupon is no longer active."
    );
  }

  const now = new Date();

  if (
    (coupon.startsAt && coupon.startsAt > now) ||
    (coupon.expiresAt && coupon.expiresAt <= now)
  ) {
    throw new CouponReservationError(
      "Coupon is not currently available."
    );
  }

  let currentAmounts: ReturnType<typeof calculateCouponMath>;
  try {
    currentAmounts = calculateCouponMath({
      subtotalPaise: input.subtotalPaise,
      shippingPaise: input.shippingPaise,
      discountType: coupon.discountType as "PERCENTAGE" | "FIXED",
      discountValue: Number(coupon.discountValue),
      minimumOrderPaise: Math.round(Number(coupon.minimumOrderAmount) * 100),
      maximumDiscountPaise: coupon.maximumDiscountAmount === null
        ? null
        : Math.round(Number(coupon.maximumDiscountAmount) * 100),
    });
  } catch {
    throw new CouponReservationError(
      "Coupon terms changed. Review your order again."
    );
  }

  if (
    currentAmounts.discountPaise !== input.expectedDiscountPaise ||
    currentAmounts.totalPaise !== input.expectedTotalPaise
  ) {
    throw new CouponReservationError(
      "Coupon terms changed. Review your order again."
    );
  }

  if (coupon.usageLimit !== null) {
    const reservedCount = await tx.couponReservation.count({
      where: {
        couponId: coupon.id,
        status: { in: ["RESERVED", "REVIEW_REQUIRED"] },
      },
    });

    if (
      coupon.usedCount + reservedCount >= coupon.usageLimit
    ) {
      throw new CouponReservationError(
        "Coupon usage limit reached."
      );
    }
  }

  await tx.couponReservation.create({
    data: {
      couponId: coupon.id,
      couponCode: coupon.code,
      orderId: input.orderId,
      status: "RESERVED",
      expiresAt: new Date(
        now.getTime() + RESERVATION_MINUTES * 60_000
      ),
    },
  });
}
