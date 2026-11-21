import { createHash, randomBytes } from "node:crypto";

export const ADMIN_RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

export function createAdminResetToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashAdminResetToken(token) };
}

export function hashAdminResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function isAdminResetTokenFormatValid(token: string) {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function getPasswordRequirements(password: string) {
  return {
    length: password.length >= 12,
    lowercase: /[a-z]/.test(password),
    uppercase: /[A-Z]/.test(password),
    number: /\d/.test(password),
    symbol: /[^A-Za-z0-9]/.test(password),
  };
}

export function isStrongAdminPassword(password: string) {
  return Object.values(getPasswordRequirements(password)).every(Boolean);
}

export function isAdminSessionVersionValid(claim: unknown, currentVersion: number) {
  const version = claim === undefined ? 0 : claim;
  return Number.isSafeInteger(version) && version === currentVersion;
}

export function resetLimitAllowed(counts: number[], maxPerBucket: number) {
  return counts.every(count => Number.isInteger(count) && count > 0 && count <= maxPerBucket);
}
