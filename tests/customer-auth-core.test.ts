import test from "node:test";
import assert from "node:assert/strict";
import { createCustomerToken, hashCustomerToken, validCustomerToken, strongCustomerPassword, CUSTOMER_RESET_TTL_MS, CUSTOMER_VERIFICATION_TTL_MS } from "../src/lib/customer-auth-core";

test("customer tokens are URL-safe, unique, and persisted as one-way hashes", () => {
  const first = createCustomerToken(); const second = createCustomerToken();
  assert.match(first.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(validCustomerToken(first.token), true);
  assert.notEqual(first.token, first.tokenHash);
  assert.equal(hashCustomerToken(first.token), first.tokenHash);
  assert.notEqual(first.tokenHash, second.tokenHash);
  assert.equal(validCustomerToken("short"), false);
});

test("customer passwords require all configured character classes and 12 characters", () => {
  assert.equal(strongCustomerPassword("Atelier2026!Craft"), true);
  assert.equal(strongCustomerPassword("short1!A"), false);
  assert.equal(strongCustomerPassword("lowercase2026!"), false);
  assert.equal(strongCustomerPassword("UPPERCASE2026!"), false);
  assert.equal(strongCustomerPassword("NoNumber!Atelier"), false);
  assert.equal(strongCustomerPassword("NoSymbol2026Atelier"), false);
  assert.equal(strongCustomerPassword("A".repeat(129)), false);
});

test("verification and reset tokens have finite expected lifetimes", () => {
  assert.equal(CUSTOMER_VERIFICATION_TTL_MS, 24 * 60 * 60 * 1000);
  assert.equal(CUSTOMER_RESET_TTL_MS, 30 * 60 * 1000);
});
