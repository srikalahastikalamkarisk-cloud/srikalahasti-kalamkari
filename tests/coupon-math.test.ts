import test from "node:test";
import assert from "node:assert/strict";

import { calculateCouponMath } from
  "../src/lib/checkout/coupon-math";

const welcome = (subtotalPaise: number) =>
  calculateCouponMath({
    subtotalPaise,
    shippingPaise: 0,
    discountType: "PERCENTAGE",
    discountValue: 10,
    minimumOrderPaise: 50000,
    maximumDiscountPaise: 10000,
  });

test("WELCOME10 rejects orders below ₹500", () => {
  assert.throws(() => welcome(40000), /Minimum order/);
});

test("WELCOME10 ₹500 gives ₹50 discount", () => {
  assert.deepEqual(welcome(50000), {
    discountPaise: 5000,
    totalPaise: 45000,
  });
});

test("WELCOME10 ₹1000 gives ₹100 discount", () => {
  assert.deepEqual(welcome(100000), {
    discountPaise: 10000,
    totalPaise: 90000,
  });
});

test("WELCOME10 ₹2000 respects ₹100 cap", () => {
  assert.deepEqual(welcome(200000), {
    discountPaise: 10000,
    totalPaise: 190000,
  });
});

test("Fixed discount calculation", () => {
  assert.deepEqual(calculateCouponMath({
    subtotalPaise: 100000,
    shippingPaise: 0,
    discountType: "FIXED",
    discountValue: 150,
    minimumOrderPaise: 0,
    maximumDiscountPaise: null,
  }), {
    discountPaise: 15000,
    totalPaise: 85000,
  });
});

test("Shipping is added after discount", () => {
  assert.deepEqual(calculateCouponMath({
    subtotalPaise: 100000,
    shippingPaise: 5000,
    discountType: "PERCENTAGE",
    discountValue: 10,
    minimumOrderPaise: 0,
    maximumDiscountPaise: null,
  }), {
    discountPaise: 10000,
    totalPaise: 95000,
  });
});

test("Reject percentage above 100", () => {
  assert.throws(() => calculateCouponMath({
    subtotalPaise: 100000,
    shippingPaise: 0,
    discountType: "PERCENTAGE",
    discountValue: 101,
    minimumOrderPaise: 0,
    maximumDiscountPaise: null,
  }), /Invalid percentage/);
});

test("Reject zero-value payment", () => {
  assert.throws(() => calculateCouponMath({
    subtotalPaise: 10000,
    shippingPaise: 0,
    discountType: "FIXED",
    discountValue: 100,
    minimumOrderPaise: 0,
    maximumDiscountPaise: null,
  }), /Invalid discounted total/);
});
