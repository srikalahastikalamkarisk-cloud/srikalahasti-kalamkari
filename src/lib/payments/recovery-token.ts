import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";

const TOKEN_VERSION = "v1";
const MAX_AGE_SECONDS = 60 * 60 * 24;

function secret(): string {
  const value = process.env.PAYMENT_RECOVERY_SECRET;

  if (!value || value.length < 64) {
    throw new Error(
      "PAYMENT_RECOVERY_SECRET is not configured securely."
    );
  }

  return value;
}

function sign(payload: string): string {
  return createHmac("sha256", secret())
    .update(payload)
    .digest("base64url");
}

export function createPaymentRecoveryToken(
  checkoutKey: string
): string {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(checkoutKey)) {
    throw new Error("Invalid checkout key.");
  }

  const issuedAt = Math.floor(Date.now() / 1000);

  const payload = [
    TOKEN_VERSION,
    checkoutKey,
    issuedAt,
  ].join(".");

  return `${payload}.${sign(payload)}`;
}

export function verifyPaymentRecoveryToken(
  token: string,
  checkoutKey: string
): boolean {
  if (
    typeof token !== "string" ||
    token.length > 512 ||
    !/^[A-Za-z0-9_-]{16,128}$/.test(checkoutKey)
  ) {
    return false;
  }

  const parts = token.split(".");

  if (parts.length !== 4) {
    return false;
  }

  const [version, tokenKey, issuedAtRaw, signature] = parts;

  if (
    version !== TOKEN_VERSION ||
    tokenKey !== checkoutKey ||
    !/^[0-9]{10,12}$/.test(issuedAtRaw) ||
    !/^[A-Za-z0-9_-]{43}$/.test(signature)
  ) {
    return false;
  }

  const issuedAt = Number(issuedAtRaw);
  const now = Math.floor(Date.now() / 1000);

  if (
    !Number.isSafeInteger(issuedAt) ||
    issuedAt > now + 60 ||
    now - issuedAt > MAX_AGE_SECONDS
  ) {
    return false;
  }

  const payload = [
    version,
    tokenKey,
    issuedAtRaw,
  ].join(".");

  const expected = Buffer.from(
    sign(payload),
    "base64url"
  );

  const received = Buffer.from(
    signature,
    "base64url"
  );

  return (
    expected.length === received.length &&
    timingSafeEqual(expected, received)
  );
}
