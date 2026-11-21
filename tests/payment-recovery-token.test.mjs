import test from "node:test";
import assert from "node:assert/strict";

import {
  createPaymentRecoveryToken,
  verifyPaymentRecoveryToken,
} from "../src/lib/payments/recovery-token.ts";

const originalSecret = process.env.PAYMENT_RECOVERY_SECRET;

process.env.PAYMENT_RECOVERY_SECRET = "a".repeat(64);

const checkoutKey = "123e4567-e89b-42d3-a456-426614174000";
const otherKey = "223e4567-e89b-42d3-a456-426614174000";

test("valid recovery token accepted", () => {
  const token = createPaymentRecoveryToken(checkoutKey);

  assert.equal(
    verifyPaymentRecoveryToken(token, checkoutKey),
    true
  );
});

test("wrong checkout key rejected", () => {
  const token = createPaymentRecoveryToken(checkoutKey);

  assert.equal(
    verifyPaymentRecoveryToken(token, otherKey),
    false
  );
});

test("modified signature rejected", () => {
  const token = createPaymentRecoveryToken(checkoutKey);
  const parts = token.split(".");

  const signature = parts[3];
  parts[3] =
    (signature[0] === "A" ? "B" : "A") +
    signature.slice(1);

  assert.equal(
    verifyPaymentRecoveryToken(parts.join("."), checkoutKey),
    false
  );
});

test("expired token rejected", () => {
  const oldNow = Date.now;

  try {
    const token = createPaymentRecoveryToken(checkoutKey);

    Date.now = () =>
      oldNow() + 25 * 60 * 60 * 1000;

    assert.equal(
      verifyPaymentRecoveryToken(token, checkoutKey),
      false
    );
  } finally {
    Date.now = oldNow;
  }
});

test("malformed token rejected", () => {
  assert.equal(
    verifyPaymentRecoveryToken("invalid", checkoutKey),
    false
  );
});

test("invalid checkout key rejected", () => {
  assert.throws(() =>
    createPaymentRecoveryToken("short")
  );
});

test("missing secret fails closed", () => {
  const token = createPaymentRecoveryToken(checkoutKey);

  delete process.env.PAYMENT_RECOVERY_SECRET;

  try {
    assert.throws(() =>
      verifyPaymentRecoveryToken(token, checkoutKey)
    );
  } finally {
    process.env.PAYMENT_RECOVERY_SECRET = "a".repeat(64);
  }
});

process.on("exit", () => {
  if (originalSecret === undefined) {
    delete process.env.PAYMENT_RECOVERY_SECRET;
  } else {
    process.env.PAYMENT_RECOVERY_SECRET = originalSecret;
  }
});

test("future-issued token rejected", () => {
  const oldNow = Date.now;

  try {
    Date.now = () =>
      oldNow() + 5 * 60 * 1000;

    const token = createPaymentRecoveryToken(checkoutKey);

    Date.now = oldNow;

    assert.equal(
      verifyPaymentRecoveryToken(token, checkoutKey),
      false
    );
  } finally {
    Date.now = oldNow;
  }
});

test("token rejected after secret rotation", () => {
  const token = createPaymentRecoveryToken(checkoutKey);

  process.env.PAYMENT_RECOVERY_SECRET = "b".repeat(64);

  try {
    assert.equal(
      verifyPaymentRecoveryToken(token, checkoutKey),
      false
    );
  } finally {
    process.env.PAYMENT_RECOVERY_SECRET = "a".repeat(64);
  }
});

test("invalid signature length rejected", () => {
  const token = createPaymentRecoveryToken(checkoutKey);
  const parts = token.split(".");

  parts[3] = "short";

  assert.equal(
    verifyPaymentRecoveryToken(parts.join("."), checkoutKey),
    false
  );
});
