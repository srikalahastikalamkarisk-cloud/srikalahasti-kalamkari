import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import {
  verifyWebhookSignature,
  verifyPaymentSignature,
} from "../src/lib/payments/signatures.ts";

const WEBHOOK_SECRET = "temporary-webhook-secret-123";
const API_SECRET = "temporary-api-secret-456";

function sign(secret, data) {
  return createHmac("sha256", secret)
    .update(data)
    .digest("hex");
}

test("valid webhook signature accepted", () => {
  process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
  const body = Buffer.from('{"event":"payment.captured"}');

  assert.equal(verifyWebhookSignature({
    rawBody: body,
    signature: sign(WEBHOOK_SECRET, body),
  }), true);
});

test("invalid webhook signature rejected", () => {
  process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;

  assert.equal(verifyWebhookSignature({
    rawBody: Buffer.from("{}"),
    signature: "a".repeat(64),
  }), false);
});

test("modified webhook payload rejected", () => {
  process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;

  assert.equal(verifyWebhookSignature({
    rawBody: Buffer.from('{"event":"payment.failed"}'),
    signature: sign(WEBHOOK_SECRET, '{"event":"payment.captured"}'),
  }), false);
});

test("malformed signature rejected", () => {
  process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;

  assert.equal(verifyWebhookSignature({
    rawBody: Buffer.from("{}"),
    signature: "invalid",
  }), false);
});

test("missing webhook secret throws safely", () => {
  delete process.env.RAZORPAY_WEBHOOK_SECRET;

  assert.throws(
    () => verifyWebhookSignature({
      rawBody: Buffer.from("{}"),
      signature: "a".repeat(64),
    }),
    /webhook secret is not configured/
  );
});

test("valid payment signature accepted", () => {
  process.env.RAZORPAY_KEY_SECRET = API_SECRET;

  const orderId = "order_TEST123";
  const paymentId = "pay_TEST123";

  assert.equal(verifyPaymentSignature({
    razorpayOrderId: orderId,
    razorpayPaymentId: paymentId,
    razorpaySignature: sign(
      API_SECRET,
      `${orderId}|${paymentId}`
    ),
  }), true);
});

test("invalid payment signature rejected", () => {
  process.env.RAZORPAY_KEY_SECRET = API_SECRET;

  assert.equal(verifyPaymentSignature({
    razorpayOrderId: "order_TEST123",
    razorpayPaymentId: "pay_TEST123",
    razorpaySignature: "b".repeat(64),
  }), false);
});

test("missing API secret throws safely", () => {
  delete process.env.RAZORPAY_KEY_SECRET;

  assert.throws(
    () => verifyPaymentSignature({
      razorpayOrderId: "order_TEST123",
      razorpayPaymentId: "pay_TEST123",
      razorpaySignature: "a".repeat(64),
    }),
    /API secret is not configured/
  );
});
