import test from "node:test";
import assert from "node:assert/strict";
import { canRetryRazorpayOrder } from "../src/lib/payments/retry-eligibility";

const order = { id: "order_retry1", amount: 12000, amount_paid: 0, currency: "INR", status: "attempted" };
const input = { expectedOrderId: "order_retry1", expectedAmountPaise: 12000, order, payments: [{ status: "failed" }] };

test("allows retry on the existing unpaid order when every provider payment failed", () => {
  assert.equal(canRetryRazorpayOrder(input), true);
});

test("allows recovery when checkout was interrupted before any payment attempt", () => {
  assert.equal(canRetryRazorpayOrder({ ...input, order: { ...order, status: "created" }, payments: [] }), true);
});

test("rejects retry if any payment is authorized, captured, or pending", () => {
  for (const status of ["authorized", "captured", "created", "pending"]) {
    assert.equal(canRetryRazorpayOrder({ ...input, payments: [{ status }] }), false);
  }
});

test("rejects paid, mismatched, or unknown provider orders", () => {
  for (const candidate of [
    { ...order, status: "paid", amount_paid: 12000 },
    { ...order, amount: 11999 },
    { ...order, currency: "USD" },
    { ...order, id: "order_other" },
    { ...order, status: "attempted" },
  ]) {
    assert.equal(canRetryRazorpayOrder({ ...input, order: candidate, payments: [] }), false);
  }
});
