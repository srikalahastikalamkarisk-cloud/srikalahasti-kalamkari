import { z } from "zod";

export const moneyAmount = z.number()
  .finite()
  .min(0)
  .max(99999999.99)
  .refine(
    value => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6,
    "Maximum two decimal places allowed"
  );

export const positiveMoney = moneyAmount.refine(
  value => value > 0,
  "Amount must be greater than zero"
);

export type CouponValues = {
  discountType: string;
  discountValue: number;
  usageLimit: number | null;
  usedCount: number;
  startsAt: Date | null;
  expiresAt: Date | null;
  isActive: boolean;
};

export function validateCouponState(
  data: CouponValues
): string | null {
  if (
    data.discountType === "PERCENTAGE" &&
    data.discountValue > 100
  ) {
    return "Percentage cannot exceed 100";
  }

  if (
    data.startsAt &&
    data.expiresAt &&
    data.expiresAt <= data.startsAt
  ) {
    return "Expiry must be after start date";
  }

  if (
    data.usageLimit !== null &&
    data.usageLimit < data.usedCount
  ) {
    return "Usage limit cannot be less than used count";
  }

  if (data.isActive) {
    if (
      data.expiresAt &&
      data.expiresAt <= new Date()
    ) {
      return "Expired coupon cannot be enabled";
    }

    if (
      data.usageLimit !== null &&
      data.usedCount >= data.usageLimit
    ) {
      return "Coupon usage limit has been reached";
    }
  }

  return null;
}
