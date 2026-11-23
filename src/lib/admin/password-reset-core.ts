import "server-only";
import { createHash, randomBytes } from "node:crypto";
export {
  getPasswordRequirements,
  isAdminResetTokenFormatValid,
  isAdminSessionVersionValid,
  isStrongAdminPassword,
  resetLimitAllowed,
} from "./password-reset-validation";

export const ADMIN_RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

export function createAdminResetToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashAdminResetToken(token) };
}

export function hashAdminResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
