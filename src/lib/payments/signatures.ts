import "server-only";

import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";

function safeCompareHex(
  expected: string,
  received: string
): boolean {
  if (
    !/^[a-f0-9]{64}$/i.test(expected) ||
    !/^[a-f0-9]{64}$/i.test(received)
  ) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(received, "hex");

  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

export function verifyPaymentSignature(input: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET;

  if (!secret || !secret.trim()) {
    throw new Error("Razorpay API secret is not configured.");
  }

  if (
    !input.razorpayOrderId ||
    !input.razorpayPaymentId
  ) {
    return false;
  }

  const expected = createHmac("sha256", secret)
    .update(
      `${input.razorpayOrderId}|${input.razorpayPaymentId}`
    )
    .digest("hex");

  return safeCompareHex(
    expected,
    input.razorpaySignature
  );
}

export function verifyWebhookSignature(input: {
  rawBody: Buffer;
  signature: string;
}): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

  if (!secret || !secret.trim()) {
    throw new Error("Razorpay webhook secret is not configured.");
  }

  if (!Buffer.isBuffer(input.rawBody)) {
    return false;
  }

  const expected = createHmac("sha256", secret)
    .update(input.rawBody)
    .digest("hex");

  return safeCompareHex(expected, input.signature);
}
