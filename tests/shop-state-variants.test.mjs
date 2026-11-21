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
  addToCart("fabric-1", "variant-2m");
  addToCart("fabric-1", "variant-3m");
  addToCart("fabric-1", "variant-2m");
  assert.deepEqual(readCart(), [
    { id: "fabric-1", quantity: 2, variantId: "variant-2m" },
    { id: "fabric-1", quantity: 1, variantId: "variant-3m" },
  ]);
  updateCart("fabric-1", 3, "variant-2m");
  updateCart("fabric-1", 0, "variant-3m");
  assert.deepEqual(readCart(), [
    { id: "fabric-1", quantity: 3, variantId: "variant-2m" },
  ]);
});

test("verified purchase clearing preserves sibling variant lines", () => {
  values.clear();
  addToCart("fabric-1", "variant-2m");
  addToCart("fabric-1", "variant-3m");
  clearPurchasedItems([
    { productId: "fabric-1", quantity: 1, variantId: "variant-2m" },
  ]);
  assert.deepEqual(readCart(), [
    { id: "fabric-1", quantity: 1, variantId: "variant-3m" },
  ]);
});
