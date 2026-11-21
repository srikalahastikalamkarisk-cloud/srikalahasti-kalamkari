import "server-only";

import Razorpay from "razorpay";

function getRazorpayCredentials() {
  const mode = process.env.RAZORPAY_MODE;
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();

  if (mode !== "live") {
    throw new Error(
      "Razorpay integration requires LIVE mode."
    );
  }

  if (
    !keyId ||
    !keyId.startsWith("rzp_live_") ||
    !keySecret
  ) {
    throw new Error(
      "Razorpay LIVE credentials are missing or invalid."
    );
  }

  return { keyId, keySecret };
}

export function getRazorpayClient() {
  const { keyId, keySecret } = getRazorpayCredentials();

  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
}

export function getRazorpayPublicKey() {
  return getRazorpayCredentials().keyId;
}
