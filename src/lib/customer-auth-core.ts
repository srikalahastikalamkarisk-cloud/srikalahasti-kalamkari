import "server-only";
import { createHash, randomBytes } from "node:crypto";

export const CUSTOMER_COOKIE = "sk_customer_session";
export const CUSTOMER_SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;
export const CUSTOMER_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
export const CUSTOMER_RESET_TTL_MS = 30 * 60 * 1000;

export function createCustomerToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashCustomerToken(token) };
}

export function hashCustomerToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function validCustomerToken(token: string) {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function strongCustomerPassword(password: string) {
  return password.length >= 12 && password.length <= 128 &&
    /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
}
