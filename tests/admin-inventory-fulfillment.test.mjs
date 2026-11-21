import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { synchronizeAvailability } from "../src/lib/admin/inventory-policy.ts";
import {
  fulfillmentEligible,
  isValidForwardTransition,
  nextFulfillmentStatus,
} from "../src/lib/orders/fulfillment.ts";

const inventoryRoute = readFileSync(new URL("../src/app/api/admin/inventory/route.ts", import.meta.url), "utf8");
const inventoryHelper = readFileSync(new URL("../src/lib/admin/inventory.ts", import.meta.url), "utf8");
const deductionHelper = readFileSync(new URL("../src/lib/payments/deduct-order-inventory.ts", import.meta.url), "utf8");
const fulfillmentRoute = readFileSync(new URL("../src/app/api/admin/orders/[id]/status/route.ts", import.meta.url), "utf8");
const checkoutVerifier = readFileSync(new URL("../src/lib/checkout/verify-products.ts", import.meta.url), "utf8");
const webhookRoute = readFileSync(new URL("../src/app/api/payments/webhook/route.ts", import.meta.url), "utf8");

test("zero stock always prevents IN_STOCK availability", () => {
  assert.equal(synchronizeAvailability(0, "IN_STOCK"), "OUT_OF_STOCK");
  assert.equal(synchronizeAvailability(0, "OUT_OF_STOCK", "IN_STOCK"), "OUT_OF_STOCK");
});

test("restocking an ordinary out-of-stock product makes it purchasable", () => {
  assert.equal(synchronizeAvailability(3, "OUT_OF_STOCK"), "IN_STOCK");
});

test("COMING_SOON is retained during stock adjustment until explicitly changed", () => {
  assert.equal(synchronizeAvailability(20, "COMING_SOON"), "COMING_SOON");
  assert.equal(synchronizeAvailability(20, "COMING_SOON", "IN_STOCK"), "IN_STOCK");
});

test("admin inventory API requires admin auth and same-origin writes", () => {
  assert.match(inventoryRoute, /getCurrentAdmin/);
  assert.match(inventoryRoute, /Unauthorized/);
  assert.match(inventoryRoute, /Invalid origin/);
  assert.match(inventoryRoute, /COMING_SOON/);
});

test("manual inventory changes lock rows and record stock movement", () => {
  assert.match(inventoryHelper, /FOR UPDATE/);
  assert.match(inventoryHelper, /inventoryMovement\.create/);
  assert.match(inventoryHelper, /INVALID_STOCK/);
});

test("paid-order deduction records movement and synchronizes zero stock", () => {
  assert.match(deductionHelper, /movementType: "ORDER_DEDUCTION"/);
  assert.match(deductionHelper, /nextStock === 0/);
  assert.match(deductionHelper, /availabilityStatus: "IN_STOCK"/);
});

test("fulfillment transitions only move forward", () => {
  assert.equal(nextFulfillmentStatus("PENDING"), "PROCESSING");
  assert.equal(nextFulfillmentStatus("PROCESSING"), "SHIPPED");
  assert.equal(nextFulfillmentStatus("SHIPPED"), "DELIVERED");
  assert.equal(nextFulfillmentStatus("DELIVERED"), undefined);
  assert.equal(isValidForwardTransition("DELIVERED", "SHIPPED"), false);
  assert.equal(isValidForwardTransition("PENDING", "SHIPPED"), false);
  assert.match(fulfillmentRoute, /FOR UPDATE/);
});

test("fulfillment requires paid status and deducted inventory", () => {
  assert.equal(fulfillmentEligible("PAID", "DEDUCTED"), true);
  assert.equal(fulfillmentEligible("UNPAID", "DEDUCTED"), false);
  assert.equal(fulfillmentEligible("PAID", "REVIEW_REQUIRED"), false);
});

test("checkout rejects unavailable status and insufficient stock before payment", () => {
  assert.match(checkoutVerifier, /availabilityStatus !== "IN_STOCK"/);
  assert.match(checkoutVerifier, /product\.stock < item\.quantity/);
});

test("webhook duplicate processing and inventory reconciliation remain idempotent", () => {
  assert.match(webhookRoute, /code === "P2002"/);
  assert.match(webhookRoute, /reconcilePaidInventory/);
  assert.match(deductionHelper, /ALREADY_DEDUCTED/);
  assert.match(deductionHelper, /inventoryDeductedAt/);
});

test("fulfilment API enforces admin auth and origin checks", () => {
  assert.match(fulfillmentRoute, /getCurrentAdmin/);
  assert.match(fulfillmentRoute, /validOrigin\(req\)/);
});
