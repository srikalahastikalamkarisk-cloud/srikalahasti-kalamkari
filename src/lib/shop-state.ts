"use client";
import { useEffect, useState } from "react";
export type ProductId = string | number;
export type CartLine = { id: ProductId; quantity: number; variantId?: string };
const CART="sk-cart-v1", WISH="sk-wishlist-v1", BUY="sk-buy-now-v1", EVENT="sk-shop-state-change";
function read<T>(key:string,fallback:T):T {if(typeof window==="undefined")return fallback;try {const v=JSON.parse(localStorage.getItem(key)||"null");return Array.isArray(v)?v as T:fallback;}catch{return fallback;}}
function write<T>(key:string,value:T){localStorage.setItem(key,JSON.stringify(value));window.dispatchEvent(new Event(EVENT));}
export function reconcileWishlistProducts(
  visibleProductIds: readonly ProductId[]
): number {
  if (typeof window === "undefined") return 0;

  const validIds = new Set(visibleProductIds.map(String));
  const current = read<ProductId[]>(WISH, []);

  const remaining = Array.from(
    new Set(current.map(String))
  ).filter(id => validIds.has(id));

  const removed = current.length - remaining.length;

  if (JSON.stringify(current) !== JSON.stringify(remaining)) {
    write(WISH, remaining);
  }

  return removed;
}

export function reconcileCartProducts(
  visibleProductIds: readonly ProductId[]
): number {
  if (typeof window === "undefined") return 0;

  const validIds = new Set(visibleProductIds.map(String));
  const current = read<CartLine[]>(CART, []);

  const remaining = current.filter(
    line => validIds.has(String(line.id))
  );

  const removed = current.length - remaining.length;

  if (removed > 0) {
    write(CART, remaining);
  }

  return removed;
}

export function stockLimitMessage(stock: number) {
  return stock <= 0
    ? "This product is currently out of stock."
    : `Only ${stock} ${stock === 1 ? "unit is" : "units are"} available. Need more? Please contact us on WhatsApp.`;
}

export function addToCart(
  id: ProductId,
  variantId: string | undefined,
  stock: number,
  quantity = 1
): boolean {
  if (!Number.isFinite(stock) ||
      !Number.isInteger(quantity) ||
      quantity < 1) return false;

  const list = read<CartLine[]>(CART, []);
  const matches = list.filter(x =>
    String(x.id) === String(id) &&
    (x.variantId || "") === (variantId || "")
  );
  const current = matches.reduce(
    (sum, line) => sum + line.quantity, 0
  );
  const next = current + quantity;

  if (next > Math.floor(stock) || next > 20) return false;

  return updateCart(id, next, variantId, stock);
}

export function updateCart(
  id: ProductId,
  quantity: number,
  variantId?: string,
  stock?: number
): boolean {
  if (!Number.isInteger(quantity)) return false;

  const list = read<CartLine[]>(CART, []);
  const matches = (x: CartLine) =>
    String(x.id) === String(id) &&
    (x.variantId || "") === (variantId || "");

  const current = list.filter(matches)
    .reduce((sum, line) => sum + line.quantity, 0);

  if (quantity > current &&
      (stock === undefined ||
       !Number.isFinite(stock) ||
       quantity > Math.floor(stock) ||
       quantity > 20)) return false;

  const remaining = list.filter(x => !matches(x));

  if (quantity > 0) {
    const index = list.findIndex(matches);
    remaining.splice(
      index < 0 ? remaining.length : index,
      0,
      { id, quantity, ...(variantId ? { variantId } : {}) }
    );
  }

  write(CART, remaining);
  return true;
}

export function toggleWishlist(id: ProductId) {
  const ids = Array.from(
    new Set(read<ProductId[]>(WISH, []).map(String))
  );
  const key = String(id);

  write(
    WISH,
    ids.includes(key)
      ? ids.filter(value => value !== key)
      : [...ids, key]
  );
}
export function useShopState(){const [cart,setCart]=useState<CartLine[]>([]);const [wishlist,setWishlist]=useState<ProductId[]>([]);useEffect(()=>{const refresh=()=>{setCart(read(CART,[]));setWishlist(read(WISH,[]));};refresh();window.addEventListener(EVENT,refresh);window.addEventListener("storage",refresh);return()=>{window.removeEventListener(EVENT,refresh);window.removeEventListener("storage",refresh);};},[]);return {cart,wishlist};}


export function buyNow(id: ProductId, quantity = 1, variantId?: string) {
  if (typeof window === "undefined") return;
  const safeQuantity = Math.max(1, Math.min(20, Math.floor(quantity)));
  sessionStorage.setItem(BUY, JSON.stringify({ id, quantity: safeQuantity, ...(variantId ? { variantId } : {}) }));
}

export function readBuyNow(): CartLine | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(BUY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (
      !value ||
      typeof value !== "object" ||
      !("id" in value) ||
      !("quantity" in value)
    ) return null;

    const line = value as Record<string, unknown>;
    if (
      typeof line.id !== "string" &&
      typeof line.id !== "number"
    ) return null;
    if (
      typeof line.quantity !== "number" ||
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > 20
    ) return null;

    return {
      id: line.id,
      quantity: line.quantity,
      ...(typeof line.variantId === "string" && line.variantId
        ? { variantId: line.variantId }
        : {}),
    };
  } catch {
    return null;
  }
}


/**
 * Remove purchased items only after the server confirms PAID.
 * Preserve unrelated cart products.
 */
export function clearPurchasedItems(
  purchased: { productId: string; quantity: number; variantId?: string | null }[],
  buyNowOnly = false
) {
  if (typeof window === "undefined") return;

  if (buyNowOnly) {
    const current = readBuyNow();

    if (
      !current ||
      purchased.length !== 1 ||
      String(current.id) !== String(purchased[0].productId) ||
      (current.variantId || "") !== (purchased[0].variantId || "") ||
      current.quantity !== purchased[0].quantity
    ) return;

    sessionStorage.removeItem(BUY);
    window.dispatchEvent(new Event(EVENT));
    return;
  }

  const current = read<CartLine[]>(CART, []);

  const remaining = current.flatMap(line => {
    const purchasedLine = purchased.find(
      item =>
        String(item.productId) === String(line.id) &&
        (item.variantId || "") === (line.variantId || "")
    );

    if (!purchasedLine) return [line];

    const quantity = Math.max(
      0,
      line.quantity - purchasedLine.quantity
    );

    return quantity > 0
      ? [{ ...line, quantity }]
      : [];
  });

  write(CART, remaining);
}
