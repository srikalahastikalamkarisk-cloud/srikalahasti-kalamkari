import test from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_RESET_TOKEN_TTL_MS,
  createAdminResetToken,
  hashAdminResetToken,
} from "../src/lib/admin/password-reset-core";
import {
  getPasswordRequirements,
  isAdminResetTokenFormatValid,
  isAdminSessionVersionValid,
  isStrongAdminPassword,
  resetLimitAllowed,
} from "../src/lib/admin/password-reset-validation";

test("reset tokens are random-format URL-safe values stored as SHA-256 hashes", () => {
  const first = createAdminResetToken();
  const second = createAdminResetToken();

  assert.equal(first.token.length, 43);
  assert.match(first.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(isAdminResetTokenFormatValid(first.token), true);
  assert.notEqual(first.token, first.tokenHash);
  assert.equal(first.tokenHash, hashAdminResetToken(first.token));
  assert.match(first.tokenHash, /^[a-f0-9]{64}$/);
  assert.notEqual(first.token, second.token);
  assert.notEqual(first.tokenHash, second.tokenHash);
  assert.equal(ADMIN_RESET_TOKEN_TTL_MS, 30 * 60 * 1000);
});

test("reset password requirements accept strong values and reject missing classes", () => {
  assert.deepEqual(getPasswordRequirements("SecurePass123!"), {
    length: true, lowercase: true, uppercase: true, number: true, symbol: true,
  });
  assert.equal(isStrongAdminPassword("SecurePass123!"), true);
  assert.equal(isStrongAdminPassword("weakpassword"), false);
  assert.equal(isAdminResetTokenFormatValid("bad-token"), false);
});

test("session version and reset rate-limit helpers enforce their bounds", () => {
  assert.equal(isAdminSessionVersionValid(undefined, 0), true);
  assert.equal(isAdminSessionVersionValid(3, 3), true);
  assert.equal(isAdminSessionVersionValid(2, 3), false);
  assert.equal(isAdminSessionVersionValid("3", 3), false);
  assert.equal(resetLimitAllowed([1, 5], 5), true);
  assert.equal(resetLimitAllowed([1, 6], 5), false);
  assert.equal(resetLimitAllowed([0], 5), false);
});
