import "server-only";

import { prisma } from "@/lib/prisma";
import { calculateCouponMath } from "./coupon-math";
import { validateCouponEligibility } from "./coupon-eligibility";

export class CouponValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CouponValidationError";
  }
}

export type CouponCalculation = {
  couponId: string | null;
  couponCode: string | null;
  discountPaise: number;
  totalPaise: number;
};

export async function calculateCoupon(
  rawCode: string | null | undefined,
  subtotalPaise: number,
  shippingPaise = 0,
  reservationOrderId?: string
): Promise<CouponCalculation> {
  if (
    !Number.isSafeInteger(subtotalPaise) ||
    subtotalPaise <= 0 ||
    !Number.isSafeInteger(shippingPaise) ||
    shippingPaise < 0
  ) {
    throw new CouponValidationError("Invalid order amount.");
  }

  const baseTotal = subtotalPaise + shippingPaise;

  if (!Number.isSafeInteger(baseTotal)) {
    throw new CouponValidationError("Invalid order total.");
  }

  if (!rawCode) {
    return {
      couponId: null,
      couponCode: null,
      discountPaise: 0,
      totalPaise: baseTotal,
    };
  }

  const code = rawCode.trim().toUpperCase();

  if (!/^[A-Z0-9_-]{3,64}$/.test(code)) {
    throw new CouponValidationError("Invalid coupon code.");
  }

  const coupon = await prisma.coupon.findUnique({
    where: { code },
  });

  if (!coupon) {
    throw new CouponValidationError(
      "Coupon is invalid or disabled."
    );
  }

  // A committed reservation locks the reviewed discount for that existing
  // checkout even if the campaign later expires or its terms are edited.
  if (reservationOrderId) {
    const reservation = await prisma.couponReservation.findUnique({
      where: { orderId: reservationOrderId },
    });
    if (
      reservation?.couponId === coupon.id &&
      reservation.couponCode === coupon.code &&
      (reservation.status === "RESERVED" || reservation.status === "REVIEW_REQUIRED")
    ) {
      const order = await prisma.order.findUnique({
        where: { id: reservationOrderId },
        select: {
          couponCode: true,
          subtotal: true,
          shippingAmount: true,
          discountAmount: true,
          totalAmount: true,
        },
      });
      if (
        order?.couponCode === coupon.code &&
        Math.round(Number(order.subtotal) * 100) === subtotalPaise &&
        Math.round(Number(order.shippingAmount) * 100) === shippingPaise
      ) {
        return {
          couponId: coupon.id,
          couponCode: coupon.code,
          discountPaise: Math.round(Number(order.discountAmount) * 100),
          totalPaise: Math.round(Number(order.totalAmount) * 100),
        };
      }
    }
  }

  if (!coupon.isActive) {
    throw new CouponValidationError("Coupon is invalid or disabled.");
  }

  const reservedCount = await prisma.couponReservation.count({
    where: {
      couponId: coupon.id,
      status: { in: ["RESERVED", "REVIEW_REQUIRED"] },
      ...(reservationOrderId ? { orderId: { not: reservationOrderId } } : {}),
    },
  });

  const eligibilityError = validateCouponEligibility({
    isActive: coupon.isActive,
    startsAt: coupon.startsAt,
    expiresAt: coupon.expiresAt,
    usageLimit: coupon.usageLimit,
    usedCount: coupon.usedCount,
    reservedCount,
  });

  if (eligibilityError) {
    throw new CouponValidationError(eligibilityError);
  }

  let calculated: {
    discountPaise: number;
    totalPaise: number;
  };

  try {
    calculated = calculateCouponMath({
      subtotalPaise,
      shippingPaise,
      discountType: coupon.discountType as
        "PERCENTAGE" | "FIXED",
      discountValue: Number(coupon.discountValue),
      minimumOrderPaise: Math.round(
        Number(coupon.minimumOrderAmount) * 100
      ),
      maximumDiscountPaise:
        coupon.maximumDiscountAmount === null
          ? null
          : Math.round(
              Number(coupon.maximumDiscountAmount) * 100
            ),
    });
  } catch (error) {
    throw new CouponValidationError(
      error instanceof Error
        ? error.message
        : "Invalid coupon calculation."
    );
  }

  return {
    couponId: coupon.id,
    couponCode: coupon.code,
    discountPaise: calculated.discountPaise,
    totalPaise: calculated.totalPaise,
  };
}
