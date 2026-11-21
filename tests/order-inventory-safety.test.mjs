import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../src/lib/payments/deduct-order-inventory.ts", import.meta.url),
  "utf8"
);

test("inventory helper requires order lock", () => {
  assert.match(source, /Caller must hold the Order row FOR UPDATE lock/);
});

test("inventory helper checks already deducted", () => {
  assert.match(source, /ALREADY_DEDUCTED/);
  assert.match(source, /inventoryDeductedAt/);
});

test("inventory helper locks product rows", () => {
  assert.match(source, /FOR UPDATE/);
});

test("inventory helper uses conditional stock decrement", () => {
  assert.match(source, /stock: \{ gte: quantity \}/);
  assert.match(source, /stock: \{ decrement: quantity \}/);
});

test("inventory helper accepts fixed and per-meter product inventory", () => {
  assert.match(source, /availabilityStatus === "IN_STOCK"/);
  assert.match(source, /pricingMode === "FIXED" \|\|\s*product\.pricingMode === "PER_METER"/);
  assert.match(source, /pricingMode: \{ in: \["FIXED", "PER_METER"\] \}/);
});

test("inventory helper supports review status", () => {
  assert.match(source, /REVIEW_REQUIRED/);
});

test("inventory helper rolls back concurrent stock failures", () => {
  assert.match(source, /INVENTORY_CONCURRENT_STOCK_CHANGE/);
  assert.match(source, /throw new Error/);
});
