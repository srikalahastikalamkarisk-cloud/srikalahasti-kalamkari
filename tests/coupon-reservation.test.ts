import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "../src/generated/prisma/client";
import {
  reserveCoupon,
  CouponReservationError,
} from "../src/lib/checkout/reserve-coupon";

type MockOptions = {
  existing?: {
    couponId: string;
    couponCode: string;
    status: string;
  } | null;
  usedCount?: number;
  usageLimit?: number | null;
  reservedCount?: number;
  discountValue?: number;
};

function mockTransaction(options: MockOptions = {}) {
  let created = 0;
  let locked = 0;

  const coupon = {
    id: "coupon-1",
    code: "WELCOME10",
    isActive: true,
    startsAt: null,
    expiresAt: null,
    usedCount: options.usedCount ?? 0,
    usageLimit: options.usageLimit ?? null,
    discountType: "PERCENTAGE",
    discountValue: options.discountValue ?? 10,
    minimumOrderAmount: 500,
    maximumDiscountAmount: 100,
  };

  const tx = {
    $queryRaw: async () => {
      locked++;
      return [{ id: coupon.id }];
    },
    couponReservation: {
      findUnique: async () => options.existing ?? null,
      count: async () => options.reservedCount ?? 0,
      create: async () => {
        created++;
        return {};
      },
    },
    coupon: {
      findUnique: async () => coupon,
    },
  };

  return {
    tx: tx as unknown as Prisma.TransactionClient,
    get created() { return created; },
    get locked() { return locked; },
  };
}

const input = {
  couponId: "coupon-1",
  couponCode: "WELCOME10",
  orderId: "order-1",
  subtotalPaise: 100000,
  shippingPaise: 0,
  expectedDiscountPaise: 10000,
  expectedTotalPaise: 90000,
};

test("New reservation is created", async () => {
  const mock = mockTransaction({
    usageLimit: 10,
    reservedCount: 2,
  });

  await reserveCoupon(mock.tx, input);

  assert.equal(mock.created, 1);
  assert.equal(mock.locked, 1);
});

test("Duplicate reservation is idempotent", async () => {
  const mock = mockTransaction({
    existing: {
      couponId: "coupon-1",
      couponCode: "WELCOME10",
      status: "RESERVED",
    },
  });

  await reserveCoupon(mock.tx, input);

  assert.equal(mock.created, 0);
});

test("Exhausted coupon rejects reservation", async () => {
  const mock = mockTransaction({
    usedCount: 8,
    usageLimit: 10,
    reservedCount: 2,
  });

  await assert.rejects(
    reserveCoupon(mock.tx, input),
    CouponReservationError
  );

  assert.equal(mock.created, 0);
});

test("Available final slot is accepted", async () => {
  const mock = mockTransaction({
    usedCount: 8,
    usageLimit: 10,
    reservedCount: 1,
  });

  await reserveCoupon(mock.tx, input);

  assert.equal(mock.created, 1);
});

test("Changed coupon reservation is rejected", async () => {
  const mock = mockTransaction({
    existing: {
      couponId: "different-coupon",
      couponCode: "OTHER10",
      status: "RESERVED",
    },
  });

  await assert.rejects(
    reserveCoupon(mock.tx, input),
    CouponReservationError
  );

  assert.equal(mock.created, 0);
});

test("Changed coupon terms cannot reserve a stale checkout amount", async () => {
  const mock = mockTransaction({ discountValue: 5 });

  await assert.rejects(
    reserveCoupon(mock.tx, input),
    /terms changed/
  );

  assert.equal(mock.created, 0);
});
