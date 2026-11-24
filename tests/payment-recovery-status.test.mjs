import test from "node:test";
import assert from "node:assert/strict";

import {
  recoveryStatusFromOrder,
} from "../src/lib/payments/recovery-status.ts";

test("unknown order requires review", () => {
  const result = recoveryStatusFromOrder(null);

  assert.equal(result.status, "REVIEW_REQUIRED");
  assert.equal(result.retryAllowed, false);
});

test("paid order returns PAID", () => {
  const result = recoveryStatusFromOrder({
    orderNumber: "SKK-123-ABCDEF",
    paymentStatus: "PAID",
    paymentAttempts: [{ status: "CAPTURED" }],
  });

  assert.equal(result.status, "PAID");
  assert.equal(result.retryAllowed, false);
  assert.equal(result.orderNumber, "SKK-123-ABCDEF");
});

test("failed payment is surfaced without enabling an unsafe retry", () => {
  const result = recoveryStatusFromOrder({
    paymentStatus: "UNPAID",
    paymentAttempts: [{ status: "FAILED" }],
  });

  assert.equal(result.status, "FAILED");
  assert.equal(result.retryAllowed, false);
});

test("unpaid attempted order remains pending", () => {
  const result = recoveryStatusFromOrder({
    paymentStatus: "UNPAID",
    paymentAttempts: [{ status: "CREATED" }],
  });

  assert.equal(result.status, "PENDING");
  assert.equal(result.retryAllowed, false);
});

test("unpaid order without attempt requires review", () => {
  const result = recoveryStatusFromOrder({
    paymentStatus: "UNPAID",
    paymentAttempts: [],
  });

  assert.equal(result.status, "REVIEW_REQUIRED");
  assert.equal(result.retryAllowed, false);
});

test("recovery response contains no customer PII", () => {
  const result = recoveryStatusFromOrder({
    orderNumber: "SKK-123-ABCDEF",
    paymentStatus: "PAID",
    paymentAttempts: [],
  });

  assert.deepEqual(
    Object.keys(result).sort(),
    ["orderNumber", "retryAllowed", "status", "success"]
  );
});

test("canceled unpaid orders never authorize payment retry", () => {
  const result = recoveryStatusFromOrder({
    orderNumber: "SKK-123-ABCDEF",
    orderStatus: "CANCELLED",
    paymentStatus: "UNPAID",
    paymentAttempts: [{ status: "FAILED" }],
  }, true);

  assert.equal(result.status, "CANCELLED");
  assert.equal(result.retryAllowed, false);
});

test("a canceled order with confirmed payment remains reported as paid", () => {
  const result = recoveryStatusFromOrder({
    orderNumber: "SKK-123-ABCDEF",
    orderStatus: "CANCELLED",
    paymentStatus: "PAID",
    paymentAttempts: [{ status: "CAPTURED" }],
  });

  assert.equal(result.status, "PAID");
  assert.equal(result.retryAllowed, false);
});
