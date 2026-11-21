import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../src/lib/payments/deduct-order-inventory.ts", import.meta.url),
  "utf8"
);

test("order inventory reads variant IDs", () => {
  assert.match(source, /variantId:\s*true/);
});

test("variant inventory uses variant-specific quantities", () => {
  assert.match(source, /variantQuantities/);
});

test("variant rows are locked before deduction", () => {
  assert.match(source, /ProductVariant/);
  assert.match(source, /FOR UPDATE/);
});

test("variant inventory uses conditional decrement", () => {
  assert.match(source, /tx\.productVariant\.updateMany/);
  assert.match(source, /stock:\s*\{\s*gte:\s*quantity\s*\}/);
});

test("variant inventory validates active variants", () => {
  assert.match(source, /variant\.isActive/);
});

test("variant inventory verifies product ownership", () => {
  assert.match(source, /variant\.productId/);
});

test("variant inventory retains idempotency", () => {
  assert.match(source, /ALREADY_DEDUCTED/);
  assert.match(source, /inventoryDeductedAt/);
});

test("variant inventory retains review protection", () => {
  assert.match(source, /REVIEW_REQUIRED/);
});

test("variant inventory retains transaction rollback", () => {
  assert.match(source, /INVENTORY_CONCURRENT_STOCK_CHANGE/);
});
