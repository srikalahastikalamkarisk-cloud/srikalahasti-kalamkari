export type CouponMathInput = {
  subtotalPaise: number;
  shippingPaise: number;
  discountType: "PERCENTAGE" | "FIXED";
  discountValue: number;
  minimumOrderPaise: number;
  maximumDiscountPaise: number | null;
};

export function calculateCouponMath(input: CouponMathInput) {
  const {
    subtotalPaise,
    shippingPaise,
    discountType,
    discountValue,
    minimumOrderPaise,
    maximumDiscountPaise,
  } = input;

  const amounts = [
    subtotalPaise,
    shippingPaise,
    minimumOrderPaise,
  ];

  if (
    amounts.some(value =>
      !Number.isSafeInteger(value) || value < 0
    ) ||
    subtotalPaise <= 0 ||
    !Number.isFinite(discountValue) ||
    discountValue <= 0 ||
    (maximumDiscountPaise !== null &&
      (!Number.isSafeInteger(maximumDiscountPaise) ||
       maximumDiscountPaise <= 0))
  ) {
    throw new Error("Invalid coupon calculation input.");
  }

  if (subtotalPaise < minimumOrderPaise) {
    throw new Error("Minimum order amount not reached.");
  }

  let discountPaise: number;

  if (discountType === "PERCENTAGE") {
    if (discountValue > 100) {
      throw new Error("Invalid percentage.");
    }

    const basisPoints = Math.round(discountValue * 100);

    discountPaise = Math.round(
      subtotalPaise * basisPoints / 10000
    );
  } else if (discountType === "FIXED") {
    discountPaise = Math.round(discountValue * 100);
  } else {
    throw new Error("Unsupported discount type.");
  }

  if (maximumDiscountPaise !== null) {
    discountPaise = Math.min(
      discountPaise,
      maximumDiscountPaise
    );
  }

  discountPaise = Math.min(discountPaise, subtotalPaise);

  const totalPaise =
    subtotalPaise + shippingPaise - discountPaise;

  if (
    !Number.isSafeInteger(discountPaise) ||
    discountPaise <= 0 ||
    !Number.isSafeInteger(totalPaise) ||
    totalPaise <= 0
  ) {
    throw new Error("Invalid discounted total.");
  }

  return { discountPaise, totalPaise };
}
