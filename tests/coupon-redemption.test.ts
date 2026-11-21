import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "../src/generated/prisma/client";
import { redeemCoupon } from "../src/lib/checkout/redeem-coupon";

function redemptionMock(options: {
  status?: string;
  couponCode?: string;
  couponExists?: boolean;
  incrementAllowed?: boolean;
} = {}) {
  const reservation = {
    id: "reservation-1",
    couponId: "coupon-1",
    couponCode: options.couponCode ?? "WELCOME10",
    status: options.status ?? "RESERVED",
  };
  let usedCount = 0;
  let incrementCalls = 0;
  let lockCalls = 0;

  const tx = {
    $queryRaw: async () => {
      lockCalls++;
      return options.couponExists === false ? [] : [{ id: "coupon-1" }];
    },
    couponReservation: {
      findUnique: async () => reservation,
      update: async ({ data }: { data: { status: string } }) => {
        reservation.status = data.status;
        return reservation;
      },
    },
    coupon: {
      findUnique: async () => options.couponExists === false
        ? null
        : { id: "coupon-1", code: "WELCOME10", usageLimit: 10, usedCount },
      updateMany: async () => {
        incrementCalls++;
        if (options.incrementAllowed === false) return { count: 0 };
        usedCount++;
        return { count: 1 };
      },
    },
  } as unknown as Prisma.TransactionClient;

  return {
    tx,
    reservation,
    get usedCount() { return usedCount; },
    get incrementCalls() { return incrementCalls; },
    get lockCalls() { return lockCalls; },
  };
}

const input = { orderId: "order-1", couponCode: "WELCOME10" };

test("reserved coupon is redeemed once and callback retries are idempotent", async () => {
  const mock = redemptionMock();

  assert.equal(await redeemCoupon(mock.tx, input), "REDEEMED");
  assert.equal(await redeemCoupon(mock.tx, input), "ALREADY_REDEEMED");
  assert.equal(mock.usedCount, 1);
  assert.equal(mock.incrementCalls, 1);
});

test("coupon-free order does not change coupon usage", async () => {
  const mock = redemptionMock();
  assert.equal(await redeemCoupon(mock.tx, { ...input, couponCode: null }), "NOT_APPLICABLE");
  assert.equal(mock.incrementCalls, 0);
  assert.equal(mock.lockCalls, 0);
});

test("missing reservation requires review and does not consume coupon", async () => {
  const mock = redemptionMock();
  (mock.tx as unknown as { couponReservation: { findUnique: () => Promise<null> } })
    .couponReservation.findUnique = async () => null;
  assert.equal(await redeemCoupon(mock.tx, input), "REVIEW_REQUIRED");
  assert.equal(mock.incrementCalls, 0);
});

test("mismatched coupon reservation requires review", async () => {
  const mock = redemptionMock({ couponCode: "OTHER10" });
  assert.equal(await redeemCoupon(mock.tx, input), "REVIEW_REQUIRED");
  assert.equal(mock.incrementCalls, 0);
});

test("coupon usage conflict leaves redemption for review without altering paid order", async () => {
  const mock = redemptionMock({ incrementAllowed: false });
  assert.equal(await redeemCoupon(mock.tx, input), "REVIEW_REQUIRED");
  assert.equal(mock.reservation.status, "REVIEW_REQUIRED");
  assert.equal(mock.usedCount, 0);
});

test("coupon row disappearing requires review", async () => {
  const mock = redemptionMock({ couponExists: false });
  assert.equal(await redeemCoupon(mock.tx, input), "REVIEW_REQUIRED");
  assert.equal(mock.reservation.status, "REVIEW_REQUIRED");
  assert.equal(mock.incrementCalls, 0);
});
