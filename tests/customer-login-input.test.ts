import test from "node:test";
import assert from "node:assert/strict";
import { customerLoginSchema } from "../src/lib/customer-login-input";

test("login trims and lowercases an email before validating it", () => {
  const result = customerLoginSchema.safeParse({
    email: "  Customer.Name@Example.COM  ",
    password: "valid-password-value",
  });

  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.email, "customer.name@example.com");
});

test("login accepts the exact form payload when returnTo is null", () => {
  const result = customerLoginSchema.safeParse({
    email: "customer@example.com",
    password: "correct-password",
    termsAccepted: false,
    returnTo: null,
  });

  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.returnTo, null);
});

test("login continues to reject malformed email addresses", () => {
  const result = customerLoginSchema.safeParse({ email: "not-an-email", password: "value" });
  assert.equal(result.success, false);
});
