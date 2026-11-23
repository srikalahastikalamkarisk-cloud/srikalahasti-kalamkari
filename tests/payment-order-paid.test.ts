import test from "node:test";
import assert from "node:assert/strict";
import { isAuthoritativePaidOrder } from "../src/lib/payments/order-paid-validation";

const paid = {
  id: "order_test123",
  amount: 25000,
  amount_paid: 25000,
  currency: "INR",
  status: "paid",
};

test("accepts order.paid only when signed payload and provider snapshot match local order identity and amount", () => {
  assert.equal(isAuthoritativePaidOrder({
    expectedOrderId: "order_test123",
    expectedAmountPaise: 25000,
    payload: paid,
    provider: paid,
  }), true);
});

test("rejects a paid-order payload without an authoritative paid provider record", () => {
  assert.equal(isAuthoritativePaidOrder({
    expectedOrderId: "order_test123",
    expectedAmountPaise: 25000,
    payload: paid,
    provider: { ...paid, status: "attempted", amount_paid: 0 },
  }), false);
});

test("rejects order identity, amount, paid-total, or currency mismatches", () => {
  for (const payload of [
    { ...paid, id: "order_other" },
    { ...paid, amount: 24999 },
    { ...paid, amount_paid: 24999 },
    { ...paid, currency: "USD" },
  ]) {
    assert.equal(isAuthoritativePaidOrder({
      expectedOrderId: "order_test123",
      expectedAmountPaise: 25000,
      payload,
      provider: paid,
    }), false);
  }
});
