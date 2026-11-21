import test from "node:test";
import assert from "node:assert/strict";

import { validateCouponEligibility } from
  "../src/lib/checkout/coupon-eligibility";

const now = new Date("2026-11-17T12:00:00.000Z");

const active = {
  isActive: true,
  startsAt: null,
  expiresAt: null,
  usageLimit: null,
  usedCount: 0,
};

test("Active coupon is eligible", () => {
  assert.equal(validateCouponEligibility(active, now), null);
});

test("Disabled coupon is rejected", () => {
  assert.match(
    validateCouponEligibility({
      ...active,
      isActive: false,
    }, now) ?? "",
    /disabled/
  );
});

test("Future-start coupon is rejected", () => {
  assert.match(
    validateCouponEligibility({
      ...active,
      startsAt: new Date("2026-11-18T00:00:00Z"),
    }, now) ?? "",
    /not active yet/
  );
});

test("Expired coupon is rejected", () => {
  assert.match(
    validateCouponEligibility({
      ...active,
      expiresAt: new Date("2026-11-16T00:00:00Z"),
    }, now) ?? "",
    /expired/
  );
});

test("Coupon expiring exactly now is rejected", () => {
  assert.match(
    validateCouponEligibility({
      ...active,
      expiresAt: now,
    }, now) ?? "",
    /expired/
  );
});

test("Exhausted usage limit is rejected", () => {
  assert.match(
    validateCouponEligibility({
      ...active,
      usageLimit: 5,
      usedCount: 5,
    }, now) ?? "",
    /usage limit/
  );
});

test("Coupon below usage limit is eligible", () => {
  assert.equal(
    validateCouponEligibility({
      ...active,
      usageLimit: 5,
      usedCount: 4,
    }, now),
    null
  );
});

test("Reservations consume usage slots before payment", () => {
  assert.match(
    validateCouponEligibility({
      ...active,
      usageLimit: 5,
      usedCount: 3,
      reservedCount: 2,
    }, now) ?? "",
    /usage limit/
  );
});

test("Unlimited coupon remains eligible", () => {
  assert.equal(
    validateCouponEligibility({
      ...active,
      usageLimit: null,
      usedCount: 100,
    }, now),
    null
  );
});
