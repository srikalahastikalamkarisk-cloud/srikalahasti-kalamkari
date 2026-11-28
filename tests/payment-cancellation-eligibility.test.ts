import test from "node:test";
import assert from "node:assert/strict";
import { cancellationEligibility } from "../src/lib/payments/cancellation-eligibility";

const id = "order_fixture";
const amount = 2300000;

const order = {
  id,
  amount,
  currency: "INR",
  amount_paid: 0,
  status: "attempted",
  attempts: 1,
};

const failed = {
  status: "failed",
  order_id: id,
  captured: false,
};

const collection = { count: 1, items: [failed] };

const check = (
  provider: unknown = order,
  payments: unknown = collection
) => cancellationEligibility(id, amount, provider, payments);

test("failed-only payment permits local cancellation", () => {
  assert.equal(check(), "ELIGIBLE");
});

test("created order without payment permits cancellation", () => {
  assert.equal(check(
    { ...order, status: "created", attempts: 0 },
    { count: 0, items: [] }
  ), "ELIGIBLE");
});

for (const status of [
  "authorized", "captured", "created", "pending", "refunded"
]) {
  test(`${status} payment blocks cancellation`, () => {
    assert.equal(check(order, {
      count: 1,
      items: [{ ...failed, status }],
    }), "PAYMENT_FOUND");
  });
}

test("paid provider order blocks cancellation", () => {
  assert.equal(check({
    ...order, status: "paid", amount_paid: amount
  }), "PAYMENT_FOUND");
});

test("nonzero paid amount blocks cancellation", () => {
  assert.equal(check({
    ...order, amount_paid: 1
  }), "PAYMENT_FOUND");
});

test("mismatched provider identity blocks cancellation", () => {
  assert.equal(check({
    ...order, id: "order_other"
  }), "PAYMENT_FOUND");
});

test("mismatched amount or currency blocks cancellation", () => {
  assert.equal(check({
    ...order, amount: amount + 1
  }), "PAYMENT_FOUND");

  assert.equal(check({
    ...order, currency: "USD"
  }), "PAYMENT_FOUND");
});

test("failed payment with captured flag blocks cancellation", () => {
  assert.equal(check(order, {
    count: 1,
    items: [{ ...failed, captured: true }],
  }), "PAYMENT_FOUND");
});

test("payment belonging to another order blocks cancellation", () => {
  assert.equal(check(order, {
    count: 1,
    items: [{ ...failed, order_id: "order_other" }],
  }), "PAYMENT_FOUND");
});

test("incomplete payment collection fails closed", () => {
  assert.equal(check(order, {
    count: 2, items: [failed]
  }), "VERIFY_FAILED");

  assert.equal(check({
    ...order, attempts: 2
  }), "VERIFY_FAILED");
});

test("attempted order with empty payment list fails closed", () => {
  assert.equal(check(
    { ...order, attempts: 0 },
    { count: 0, items: [] }
  ), "VERIFY_FAILED");
});

test("inconsistent created order fails closed", () => {
  assert.equal(check({
    ...order, status: "created"
  }), "VERIFY_FAILED");
});

test("malformed provider responses fail closed", () => {
  assert.equal(check(null), "VERIFY_FAILED");
  assert.equal(check(order, null), "VERIFY_FAILED");
  assert.equal(check(order, {
    count: 1, items: [null]
  }), "VERIFY_FAILED");
});

test("potentially truncated payment collection fails closed", () => {
  assert.equal(check(
    { ...order, attempts: 100 },
    { count: 100, items: Array(100).fill(failed) }
  ), "VERIFY_FAILED");
});
