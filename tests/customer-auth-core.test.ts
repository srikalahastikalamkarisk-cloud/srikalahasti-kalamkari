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

test("customer passwords allow 6 to 128 characters without mandatory character classes", () => {
  assert.equal(strongCustomerPassword(""), false);
  assert.equal(strongCustomerPassword("abcd"), false);
  assert.equal(strongCustomerPassword("abcde"), false);
  assert.equal(strongCustomerPassword("abcdef"), true);
  assert.equal(strongCustomerPassword("ABCDEF"), true);
  assert.equal(strongCustomerPassword("123456"), true);
  assert.equal(strongCustomerPassword("short1!A"), true);
  assert.equal(strongCustomerPassword("Atelier2026!Craft"), true);
  assert.equal(strongCustomerPassword("A".repeat(128)), true);
  assert.equal(strongCustomerPassword("A".repeat(129)), false);
});

test("verification and reset tokens have finite expected lifetimes", () => {
  assert.equal(CUSTOMER_VERIFICATION_TTL_MS, 24 * 60 * 60 * 1000);
  assert.equal(CUSTOMER_RESET_TTL_MS, 30 * 60 * 1000);
});
