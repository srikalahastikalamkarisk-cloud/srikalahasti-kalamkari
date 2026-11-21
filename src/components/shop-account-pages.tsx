"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { StorefrontProduct } from "@/lib/storefront-products";
import { addToCart, readBuyNow, toggleWishlist, updateCart, useShopState } from "@/lib/shop-state";
import CheckoutCustomerForm from "./checkout-customer-form";
import "./shop-account-pages.css";
const money=(n:number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(n);
export default function ShopAccountPages({
  mode,
  products,
}:{
  mode:"cart"|"wishlist"|"checkout";
  products:StorefrontProduct[];
}){
 const {cart,wishlist}=useShopState();const router=useRouter();
  const searchParams = useSearchParams();
  const directCheckout = mode === "checkout" && searchParams.get("buyNow") === "1";
  const [directLine, setDirectLine] =
    useState<ReturnType<typeof readBuyNow>>(null);

  useEffect(() => {
    if (directCheckout) {
      const timer = window.setTimeout(() => setDirectLine(readBuyNow()), 0);
      return () => window.clearTimeout(timer);
    }
  }, [directCheckout]);
 const entries: Array<{
   id: string | number;
   quantity: number;
   variantId?: string;
 }> = mode==="wishlist"
   ? wishlist.map(id=>({id,quantity:1}))
   : directCheckout
     ? (directLine?[directLine]:[])
     : cart;
 const rows=entries
    .map(line=>{
      const p=products.find(p=>p.id===line.id);
      const variant=p?.variants.find(v=>v.id===line.variantId);
      const requiresVariant=Boolean(
        p && (p.variants.length>0 || p.pricingMode==="LENGTH_OPTIONS")
      );
      return {line,p,variant,requiresVariant};
    })
    .filter((x):x is {
      line:typeof entries[number];
      p:StorefrontProduct;
      variant:StorefrontProduct["variants"][number]|undefined;
      requiresVariant:boolean;
    }=>!!x.p);

 const unitPrice=(
   p:StorefrontProduct,
   variant?:StorefrontProduct["variants"][number]
 )=>variant?.price ?? (p.pricingMode==="PER_METER" ? p.pricePerMeter ?? p.price : p.price);

 const hasInvalidSelection=rows.some(
   ({line,variant,requiresVariant,p})=>
     (requiresVariant &&
       (!line.variantId ||
        !variant ||
        !variant.isActive ||
        variant.price==null ||
        variant.stock<line.quantity)) ||
     (!requiresVariant && Boolean(line.variantId)) ||
     (!variant && (p.availabilityStatus!=="IN_STOCK" || line.quantity>p.stock))
 );

 const total=rows.reduce(
   (sum,{p,line,variant})=>
     sum+unitPrice(p,variant)*line.quantity,
   0
 );
 return <main className={`skaccount ${mode==="cart"?"skaccount--cart":mode==="checkout"?"skaccount--checkout":"skaccount--wishlist"}`}><div className="skaccount-wrap"><Link href="/shop">← Continue shopping</Link><h1>{mode==="cart"?"Shopping Cart":mode==="wishlist"?"Your Wishlist":"Checkout"}</h1>
 {mode==="checkout"&&rows.length>0&&(
  <div className="skcheckout-intro">
    <span>SECURE CHECKOUT</span>
    <p>Review your handcrafted selections and complete your order securely.</p>
  </div>
 )}
 {mode==="checkout" && rows.length>0 ? (
  <div className="skcheckout-layout">
    <div className="skcheckout-delivery-panel">
      <CheckoutCustomerForm
        subtotal={total}
        checkoutBlocked={hasInvalidSelection}
        buyNowOnly={directCheckout}
        items={rows.map(({line,p}) => ({
          productId: String(p.id),
          quantity: line.quantity,
          ...(line.variantId ? {variantId: line.variantId} : {}),
        }))}
        onRemoveProduct={(id, variantId) => {
          if (!directCheckout) {
            const match = rows.find(({p,line}) => String(p.id) === id && (line.variantId || "") === (variantId || ""));
            if (match) updateCart(match.p.id, 0, variantId);
          }
        }}
        displayProducts={rows.map(({line,p}) => ({
          id: String(p.id),
          name: p.name,
          image: p.image,
          quantity: line.quantity,
          price: unitPrice(p, rows.find(row=>row.line===line)?.variant),
          variantId: line.variantId,
          variantLabel: rows.find(row=>row.line===line)?.variant ? Object.entries(rows.find(row=>row.line===line)!.variant!.attributes||{}).map(([name,value])=>`${name}: ${value}`).join(" · ") || (rows.find(row=>row.line===line)!.variant!.lengthMeters != null ? `${rows.find(row=>row.line===line)!.variant!.lengthMeters}m` : undefined) : p.pricingMode==="PER_METER"?"Price per meter":undefined,
        }))}
      />
    </div>


  </div>
) : rows.length===0?<div className="skaccount-empty"><p>{mode==="wishlist"?"Your wishlist is empty.":"Your cart is empty."}</p><Link href="/shop">Explore products</Link></div>:<><div className="skaccount-items">{rows.map(({line,p,variant})=><article key={`${p.id}:${line.variantId||"fixed"}`} className="skaccount-item">{p.image ? (
  <img src={p.image} alt={p.name}/>
) : (
  <div style={{
    width:90,
    height:110,
    background:"#f5f0e8",
    display:"flex",
    alignItems:"center",
    justifyContent:"center",
    fontSize:11,
    color:"#76583e",
    textAlign:"center"
  }}>Kalamkari</div>
)}<div><h2>{p.name}</h2>{variant&&<p>{Object.entries(variant.attributes||{}).map(([name,value])=>`${name}: ${value}`).join(" · ") || (variant.lengthMeters != null ? `Length: ${variant.lengthMeters}m` : [variant.colorName,variant.size].filter(Boolean).join(" · "))}</p>}<p>{unitPrice(p,variant) > 0 ? `${money(unitPrice(p,variant))}${p.pricingMode==="PER_METER"&&!variant?" / meter":""}` : "Price on request"} each</p><p>Line total: {money(unitPrice(p,variant)*line.quantity)}</p>{mode==="cart"&&<div className="skaccount-quantity"><button type="button" onClick={()=>updateCart(p.id,line.quantity-1,line.variantId)} aria-label={`Decrease ${p.name} quantity`}>−</button><span>{line.quantity}{p.pricingMode==="PER_METER"&&!variant?" m":""}</span><button type="button" onClick={()=>updateCart(p.id,line.quantity+1,line.variantId)} aria-label={`Increase ${p.name} quantity`}>+</button></div>}{mode==="wishlist"&&<button type="button" onClick={()=>addToCart(p.id)}>Add to Cart</button>}</div><button type="button" className="skaccount-remove" onClick={()=>mode==="wishlist"?toggleWishlist(p.id):updateCart(p.id,0,line.variantId)}>Remove</button></article>)}</div>
 {mode!=="wishlist"&&<div className="skaccount-summary"><strong>{total > 0 ? `Subtotal: ${money(total)}` : "Product prices to be confirmed"}</strong><p>Subtotal is calculated from current product prices. Final availability and delivery charges will be confirmed at checkout.</p>{mode==="cart"?<button type="button" onClick={()=>router.push("/checkout")}>Continue to Checkout</button>:<CheckoutCustomerForm
  subtotal={total}
  checkoutBlocked={hasInvalidSelection}
  buyNowOnly={directCheckout}
  items={rows.map(({ line, p }) => ({
    productId: String(p.id),
    quantity: line.quantity,
    ...(line.variantId ? {variantId: line.variantId} : {}),
  }))}
/>}</div>}</>}
 </div></main>;
}
