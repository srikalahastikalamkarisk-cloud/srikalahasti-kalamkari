"use client";

import { useState } from "react";
import Link from "next/link";
import { Heart, ImageIcon, ShoppingBag, Star, ZoomIn, X } from "lucide-react";
import type { StorefrontProduct } from "@/lib/storefront-products";
import { addToCart, toggleWishlist, useShopState } from "@/lib/shop-state";
import "./featured-products.css";

type ProductWithImages = StorefrontProduct;

type Props = {
  products: StorefrontProduct[];
};

function imageFor(product: ProductWithImages) {
  const candidate = product.image || product.images?.[0];
  return typeof candidate === "string" && /^(\/|https?:\/\/)/.test(candidate) ? candidate : null;
}

export default function FeaturedProducts({ products }: Props) {
  const featured = products;
  const { wishlist } = useShopState();
  const [preview, setPreview] = useState<ProductWithImages | null>(null);
  const [message, setMessage] = useState("");

  return (
    <section className="skfp-section" aria-labelledby="skfp-title">
      <div className="skfp-shell">
        <header className="skfp-heading">
          <span className="skfp-eyebrow">THE HANDCRAFTED EDIT</span>
          <h2 id="skfp-title">Featured <em>Products</em></h2>
          <p>Timeless artistry, thoughtfully curated.</p>
          <p className="skfp-catalog-note">Catalog preview · All displayed prices are sample values, not confirmed selling prices.</p>
        </header>
        <div className="skfp-grid">
          {featured.map((product) => {
            const image = imageFor(product);
            const selected = wishlist.includes(product.id);
            const hasPrice = typeof product.price === "number" && product.price > 0;
            const original = product.originalPrice;
            const hasOriginal = typeof original === "number" && hasPrice && original > product.price;
            const canPurchase =
              hasPrice &&
              product.stock > 0 &&
              product.availabilityStatus === "IN_STOCK";
            const discount = hasOriginal ? Math.round((1 - product.price / original) * 100) : null;
            return (
              <article className="skfp-card" key={product.id}>
                <div className="skfp-photo">
                  <Link
                    href={`/product/${product.id}`}
                    className="skfp-product-link"
                    aria-label={`View ${product.name}`}
                  />
                  {image ? <img src={image} alt={product.name} loading="lazy" /> : (
                    <div className="skfp-placeholder"><ImageIcon size={25} strokeWidth={1.2} /><span>SRIKALAHASTI</span><small>KALAMKARI</small></div>
                  )}
                  {discount !== null && discount > 0 && <span className="skfp-badge">{discount}% OFF</span>}
                  <div className="skfp-actions">
                    <button type="button" aria-label={selected ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`} aria-pressed={selected} onClick={() => toggleWishlist(product.id)}>
                      <Heart size={16} fill={selected ? "currentColor" : "none"} />
                    </button>
                    <button type="button" aria-label={`Quick view ${product.name}`} onClick={() => setPreview(product)}><ZoomIn size={16} /></button>
                  </div>
                </div>
                <div className="skfp-details">
                  <h3 title={product.name}>
                    <Link href={`/product/${product.id}`}>
                      {product.name}
                    </Link>
                  </h3>
                  <div className="skfp-meta">
                    <span className="skfp-price">{hasPrice ? `₹${product.price.toLocaleString("en-IN")}` : "Price on request"}</span>
                    {hasOriginal && <del>₹{original.toLocaleString("en-IN")}</del>}
                    
                  </div>
                  <div className="skfp-purchase-actions">
                    <button className="skfp-cart" type="button" disabled={!canPurchase} title="Price and availability are not confirmed" onClick={() => setMessage(`Price and availability for ${product.name} need confirmation.`)}><ShoppingBag size={14} /> Buy Now</button>
                    <button className="skfp-cart-icon" type="button" aria-label={`Add ${product.name} to cart`} title="Add to cart" disabled={!canPurchase} onClick={() => {
                      if (!canPurchase) return;
                      addToCart(product.id);
                      setMessage(`${product.name} added to cart.`);
                    }}><ShoppingBag size={16} /></button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        {featured.length === 0 && <p className="skfp-empty">Products will appear here when the catalog is ready.</p>}
        {message && <p className="skfp-status" role="status">{message}</p>}
      </div>
      {preview && <div className="skfp-overlay" onClick={()=>setPreview(null)}><div className="skfp-modal" role="dialog" aria-modal="true" aria-label={preview.name} onClick={e=>e.stopPropagation()}><button className="skfp-close" aria-label="Close preview" onClick={()=>setPreview(null)}><X size={20}/></button><div className="skfp-modal-photo">{imageFor(preview) ? <img src={imageFor(preview)!} alt={preview.name} /> : <ImageIcon size={45}/>}</div><h3>{preview.name}</h3><p>{preview.price > 0 ? `₹${preview.price.toLocaleString("en-IN")}` : "Price on request · Preview listing"}</p></div></div>}
    </section>
  );
}
