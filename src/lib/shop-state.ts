"use client";
import { useEffect, useState } from "react";
export type ProductId = string | number;
export type CartLine = { id: ProductId; quantity: number; variantId?: string };
const CART="sk-cart-v1", WISH="sk-wishlist-v1", BUY="sk-buy-now-v1", EVENT="sk-shop-state-change";
function read<T>(key:string,fallback:T):T {if(typeof window==="undefined")return fallback;try {const v=JSON.parse(localStorage.getItem(key)||"null");return Array.isArray(v)?v as T:fallback;}catch{return fallback;}}
function write<T>(key:string,value:T){localStorage.setItem(key,JSON.stringify(value));window.dispatchEvent(new Event(EVENT));}
export function addToCart(id:ProductId,variantId?:string){
  const list=read<CartLine[]>(CART,[]);
  const found=list.find(x=>String(x.id)===String(id)&&(x.variantId||"")===(variantId||""));
  if(found)found.quantity+=1;
  else list.push({id,quantity:1,...(variantId?{variantId}:{})});
  write(CART,list);
}
export function updateCart(id:ProductId,quantity:number,variantId?:string){
  const list=read<CartLine[]>(CART,[]);
  const remaining=list.filter(x=>!(String(x.id)===String(id)&&(x.variantId||"")===(variantId||"")));
  if(quantity>0)remaining.push({id,quantity,...(variantId?{variantId}:{})});
  write(CART,remaining);
}
export function toggleWishlist(id:ProductId){const ids=read<ProductId[]>(WISH,[]);write(WISH,ids.includes(id)?ids.filter(x=>x!==id):[...ids,id]);}
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
