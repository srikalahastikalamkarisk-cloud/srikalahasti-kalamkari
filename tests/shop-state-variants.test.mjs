import test from "node:test";
import assert from "node:assert/strict";

const values = new Map();
const listeners = new Map();
globalThis.window = {
  localStorage: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  },
  dispatchEvent: event => {
    for (const listener of listeners.get(event.type) ?? []) listener(event);
    return true;
  },
  addEventListener: (type, listener) => {
    const list = listeners.get(type) ?? [];
    list.push(listener);
    listeners.set(type, list);
  },
  removeEventListener: () => {},
};
globalThis.localStorage = globalThis.window.localStorage;
globalThis.Event = class Event { constructor(type) { this.type = type; } };

const { addToCart, updateCart, clearPurchasedItems } = await import("../src/lib/shop-state.ts");
const readCart = () => JSON.parse(values.get("sk-cart-v1") ?? "[]");

test("cart keeps distinct variants of one product and updates each line independently", () => {
  values.clear();
  assert.equal(addToCart("fabric-1", "variant-2m", 5), true);
  assert.equal(addToCart("fabric-1", "variant-3m", 5), true);
  assert.equal(addToCart("fabric-1", "variant-2m", 5), true);
  assert.deepEqual(readCart(), [
    { id: "fabric-1", quantity: 2, variantId: "variant-2m" },
    { id: "fabric-1", quantity: 1, variantId: "variant-3m" },
  ]);
  assert.equal(updateCart("fabric-1", 3, "variant-2m", 5), true);
  updateCart("fabric-1", 0, "variant-3m");
  assert.deepEqual(readCart(), [
    { id: "fabric-1", quantity: 3, variantId: "variant-2m" },
  ]);
});

test("verified purchase clearing preserves sibling variant lines", () => {
  values.clear();
  assert.equal(addToCart("fabric-1", "variant-2m", 5), true);
  assert.equal(addToCart("fabric-1", "variant-3m", 5), true);
  clearPurchasedItems([
    { productId: "fabric-1", quantity: 1, variantId: "variant-2m" },
  ]);
  assert.deepEqual(readCart(), [
    { id: "fabric-1", quantity: 1, variantId: "variant-3m" },
  ]);
});


test("stock one blocks repeated additions", () => {
  values.clear();
  assert.equal(addToCart("saree-1", undefined, 1), true);
  for (let i = 0; i < 5; i++) {
    assert.equal(addToCart("saree-1", undefined, 1), false);
  }
  assert.deepEqual(readCart(), [
    { id: "saree-1", quantity: 1 },
  ]);
});

test("zero stock blocks cart addition", () => {
  values.clear();
  assert.equal(addToCart("saree-1", undefined, 0), false);
  assert.deepEqual(readCart(), []);
});

test("unknown stock fails closed", () => {
  values.clear();
  for (const stock of [undefined, NaN, Infinity, -1]) {
    assert.equal(addToCart("saree-1", undefined, stock), false);
  }
  assert.deepEqual(readCart(), []);
});

test("cart quantity cannot exceed available stock", () => {
  values.clear();
  assert.equal(addToCart("saree-1", undefined, 2), true);
  assert.equal(updateCart("saree-1", 2, undefined, 2), true);
  assert.equal(updateCart("saree-1", 3, undefined, 2), false);
  assert.equal(readCart()[0].quantity, 2);
});

test("variant stock limits are independent", () => {
  values.clear();
  assert.equal(addToCart("fabric-1", "variant-a", 1), true);
  assert.equal(addToCart("fabric-1", "variant-a", 1), false);
  assert.equal(addToCart("fabric-1", "variant-b", 2, 2), true);
  assert.equal(addToCart("fabric-1", "variant-b", 2), false);
  assert.deepEqual(readCart(), [
    { id: "fabric-1", quantity: 1, variantId: "variant-a" },
    { id: "fabric-1", quantity: 2, variantId: "variant-b" },
  ]);
});

test("decreasing or removing items remains possible without stock", () => {
  values.clear();
  assert.equal(addToCart("saree-1", undefined, 3, 3), true);
  assert.equal(updateCart("saree-1", 2), true);
  assert.equal(updateCart("saree-1", 3), false);
  assert.equal(updateCart("saree-1", 0), true);
  assert.deepEqual(readCart(), []);
});

test("cart retains the existing maximum quantity of twenty", () => {
  values.clear();
  assert.equal(addToCart("fabric-1", undefined, 100, 20), true);
  assert.equal(addToCart("fabric-1", undefined, 100), false);
  assert.equal(readCart()[0].quantity, 20);
});
