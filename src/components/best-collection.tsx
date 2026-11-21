"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Heart,
  ImageIcon,
  ShoppingBag,
  X,
  ZoomIn,
} from "lucide-react";
import type { StorefrontProduct } from "@/lib/storefront-products";
import { addToCart as addCatalogItem, toggleWishlist as toggleSavedItem, useShopState } from "@/lib/shop-state";
import "./best-collection.css";

type DisplayProduct = StorefrontProduct;

type Props = {
  variant?: "best" | "discover";
  products: StorefrontProduct[];
};

export default function BestCollection({ variant = "best", products }: Props) {
  const catalog = products.slice(0, variant === "discover" ? 24 : 10);
  const trackRef = useRef<HTMLDivElement>(null);
  const { wishlist, cart } = useShopState();
  const [preview, setPreview] = useState<DisplayProduct | null>(null);
  const [message, setMessage] = useState("");

  const isDiscover = variant === "discover";
  const items = isDiscover
    ? [...catalog, ...catalog]
    : [...catalog.slice(0, 10), ...catalog.slice(0, 10)];

  useEffect(() => {
    // Best Collection only: discrete, full-card movement. Discover stays manual.
    if (isDiscover) return;
    const track = trackRef.current;
    if (!track) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let paused = false;
    let resetTimer: ReturnType<typeof setTimeout> | undefined;
    const pause = () => { paused = true; };
    const resume = () => { paused = false; };
    const advance = () => {
      if (paused || reducedMotion.matches || document.hidden) return;
      const first = track.querySelector<HTMLElement>(".skp-card");
      if (!first) return;
      const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      const step = first.getBoundingClientRect().width + gap;
      const midpoint = track.scrollWidth / 2;
      if (track.scrollLeft >= midpoint - step * 1.5) {
        track.scrollLeft = 0;
      }
      track.scrollBy({ left: step, behavior: "smooth" });
    };
    track.scrollLeft = 0;
    const interval = window.setInterval(advance, 1500);
    track.addEventListener("mouseenter", pause);
    track.addEventListener("mouseleave", resume);
    track.addEventListener("focusin", pause);
    track.addEventListener("focusout", resume);
    track.addEventListener("touchstart", pause, { passive: true });
    track.addEventListener("touchend", resume);
    return () => {
      window.clearInterval(interval);
      if (resetTimer) clearTimeout(resetTimer);
      track.removeEventListener("mouseenter", pause);
      track.removeEventListener("mouseleave", resume);
      track.removeEventListener("focusin", pause);
      track.removeEventListener("focusout", resume);
      track.removeEventListener("touchstart", pause);
      track.removeEventListener("touchend", resume);
    };
  }, [isDiscover]);


  function move(direction: number) {
    const track = trackRef.current;
    if (!track) return;

    const card = track.querySelector<HTMLElement>(".skp-card");
    const width = card ? card.getBoundingClientRect().width : 240;
    const gap = parseFloat(getComputedStyle(track).columnGap) || 14;

    track.scrollBy({
      left: direction * (width + gap) * (window.innerWidth <= 640 ? 2 : 1),
      behavior: "smooth",
    });
  }

  function toggleWishlist(id: string) {
    toggleSavedItem(id);
  }

  function canPurchase(product: DisplayProduct) {
    return product.price > 0 &&
      product.stock > 0 &&
      product.availabilityStatus === "IN_STOCK";
  }

  function addToCart(product: DisplayProduct) {
    if (!canPurchase(product)) return;
    addCatalogItem(product.id);
    setMessage(product.name + " added to cart.");
  }

  return (
    <section
      className={`skp-section ${isDiscover ? "skp-auto-section" : "skp-royal-best"}`}
      aria-label={isDiscover ? "Shop Our Products" : "Best Collection"}
    >
      <div className="skp-container">
        <div className="skp-heading">
          <div>
            <p className="skp-eyebrow">
              {isDiscover
                ? "HANDCRAFTED WITH HERITAGE"
                : "THE SRIKALAHASTI EDIT"}
            </p>
            <h2>
              {isDiscover ? "Shop Our Products" : "Best Collection"}
            </h2>
            {!isDiscover && (
              <div className="skp-editorial-copy">
                <span className="skp-editorial-rule" aria-hidden="true" />
                <p>Where ancient artistry meets timeless elegance. Discover hand-painted stories woven into every Kalamkari creation.</p>
                <span className="skp-editorial-signature">THE ART OF SRIKALAHASTI</span>
              </div>
            )}
          </div>

          <div className="skp-navigation" >
            <button
              type="button"
              aria-label="Previous products"
              onClick={() => move(-1)}
            >
              <ArrowLeft size={19} />
            </button>
            <button
              type="button"
              aria-label="Next products"
              onClick={() => move(1)}
            >
              <ArrowRight size={19} />
            </button>
          </div>
        </div>

        <div className={`skp-track ${isDiscover ? "skp-auto-track" : "skp-best-auto-track"}`} ref={trackRef}>
          {items.map((product, index) => (
            <article className={`skp-card ${isDiscover ? "skp-heritage-card" : ""}`} key={`${product.id}-${index}`} aria-hidden={isDiscover && index >= catalog.length ? true : undefined}>
              <div className="skp-media">
                {product.price > 0 && product.originalPrice && product.originalPrice > product.price && <span className="skp-discount">{Math.round((1 - product.price / product.originalPrice) * 100)}% OFF</span>}

                <div className="skp-side-actions">
                  <button
                    type="button"
                    className={wishlist.includes(product.id) ? "selected" : ""}
                    aria-label={
                      wishlist.includes(product.id)
                        ? "Remove from wishlist"
                        : "Add to wishlist"
                    }
                    aria-pressed={wishlist.includes(product.id)}
                    onClick={() => toggleWishlist(product.id)}
                  >
                    <Heart
                      size={17}
                      fill={
                        wishlist.includes(product.id)
                          ? "currentColor"
                          : "none"
                      }
                    />
                  </button>

                  <button
                    type="button"
                    aria-label={"Preview " + product.name}
                    onClick={() => setPreview(product)}
                  >
                    <ZoomIn size={17} />
                  </button>
                </div>

                <Link
                  href={`/product/${product.id}`}
                  className="skp-product-image-link"
                  aria-label={`View ${product.name} details`}
                >
                  {product.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={product.image}
                      alt={product.name}
                      loading="lazy"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <div className="skp-placeholder" aria-label="Image coming soon">
                      <ImageIcon size={28} strokeWidth={1.2} />
                      <span>SRIKALAHASTI</span>
                      <small>KALAMKARI</small>
                    </div>
                  )}
                </Link>

              </div>

                {!isDiscover && (
                <div className="skp-buttons">
                  <button
                    type="button"
                    className="skp-cart"
                    disabled={!canPurchase(product)}
                    onClick={() => addToCart(product)}
                  >
                    <ShoppingBag size={13} />
                    <span>Add to Cart</span>
                  </button>


                </div>
                )}

              <div className="skp-info">
                <h3 title={product.name}>
                  <Link href={`/product/${product.id}`} className="skp-product-title-link">
                    {product.name}
                  </Link>
                </h3>

                <div className="skp-meta">
                  <div className="skp-prices">
                    <strong>{product.price > 0 ? `₹${product.price.toLocaleString("en-IN")}` : "Price on request"}</strong>
                    {product.price > 0 && product.originalPrice && product.originalPrice > product.price && <del>₹{product.originalPrice.toLocaleString("en-IN")}</del>}
                  </div>

                  
                </div>
              </div>

              {isDiscover && (
                <div className="skp-heritage-cart-wrap">
                  <button
                    type="button"
                    className="skp-heritage-cart-button"
                    disabled={!canPurchase(product)}
                    onClick={() => addToCart(product)}
                  >
                    <ShoppingBag size={15} />
                    Add to Cart
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>

        {!isDiscover && (
          <p className="skp-disclaimer">
            Catalog preview · Confirm price, availability and product details with our team.
          </p>
        )}

        {message && (
          <p className="skp-message" role="status">
            {message} {cart.length > 0 && <Link href="/cart">View cart ({cart.reduce((sum, line) => sum + line.quantity, 0)})</Link>}
          </p>
        )}
      </div>

      {preview && (
        <div
          className="skp-overlay"
          onClick={() => setPreview(null)}
        >
          <div
            className="skp-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={preview.name}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="skp-close"
              aria-label="Close preview"
              onClick={() => setPreview(null)}
            >
              <X size={20} />
            </button>

            <div className="skp-dialog-image">
              <ImageIcon size={38} />
              <span>Product image coming soon</span>
            </div>

            <h3>{preview.name}</h3>
            <strong>{preview.price > 0 ? `₹${preview.price.toLocaleString("en-IN")}` : "Price on request"}</strong>
          </div>
        </div>
      )}
    </section>
  );
}
