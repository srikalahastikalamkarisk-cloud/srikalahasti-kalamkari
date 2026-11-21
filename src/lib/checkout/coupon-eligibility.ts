export type CouponEligibilityInput = {
  isActive: boolean;
  startsAt: Date | null;
  expiresAt: Date | null;
  usageLimit: number | null;
  usedCount: number;
  reservedCount?: number;
};

export function validateCouponEligibility(
  coupon: CouponEligibilityInput,
  now = new Date()
): string | null {
  if (!coupon.isActive) {
    return "Coupon is invalid or disabled.";
  }

  if (coupon.startsAt && coupon.startsAt > now) {
    return "Coupon is not active yet.";
  }

  if (coupon.expiresAt && coupon.expiresAt <= now) {
    return "Coupon has expired.";
  }

  if (
    coupon.usageLimit !== null &&
    coupon.usedCount + (coupon.reservedCount ?? 0) >= coupon.usageLimit
  ) {
    return "Coupon usage limit has been reached.";
  }

  return null;
}
