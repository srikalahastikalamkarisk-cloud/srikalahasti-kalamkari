"use client";
import { useStockLimitNotice } from "@/components/stock-limit-notice";
import StockIndicator from "@/components/stock-indicator";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
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
import { stockLimitMessage, addToCart as addCatalogItem, toggleWishlist as toggleSavedItem, useShopState } from "@/lib/shop-state";
import "./best-collection.css";

type DisplayProduct = StorefrontProduct;

type Props = {
  whatsappNumber?: string | null;
  variant?: "best" | "discover";
  products: StorefrontProduct[];
};

export default function BestCollection({ variant = "best", products, whatsappNumber }: Props) {
  const catalog = products.slice(0, variant === "discover" ? 24 : 10);
  const trackRef = useRef<HTMLDivElement>(null);
  const { wishlist, cart } = useShopState();
  const [preview, setPreview] = useState<DisplayProduct | null>(null);
  const [message, setMessage] = useState("");
  const stockNotice = useStockLimitNotice(whatsappNumber);

  const isDiscover = variant === "discover";
  const items = isDiscover
    ? [...catalog, ...catalog]
    : [...catalog.slice(0, 10), ...catalog.slice(0, 10)];

  const manualPauseUntil = useRef(0);

  useEffect(() => {
    if (isDiscover || catalog.length < 2) return;

    const track = trackRef.current;
    if (!track) return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    );

    let frame = 0;
    let previousTime = 0;
    let remainder = 0;
    let cycleWidth = 0;
    let visible = false;
    let hovered = false;
    let focused = false;
    let touching = false;

    const measure = () => {
      const first = track.children[0] as HTMLElement | undefined;
      const duplicate = track.children[catalog.length] as HTMLElement | undefined;

      cycleWidth = first && duplicate
        ? duplicate.getBoundingClientRect().left -
          first.getBoundingClientRect().left
        : 0;
    };

    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      previousTime = 0;
      remainder = 0;
    };

    const tick = (now: number) => {
      frame = 0;

      if (!visible || document.hidden || reducedMotion.matches) {
        previousTime = 0;
        return;
      }

      const elapsed = previousTime
        ? Math.min(now - previousTime, 32)
        : 0;

      previousTime = now;

      const canLoop =
        cycleWidth > track.clientWidth &&
        track.scrollWidth - track.clientWidth >= cycleWidth;

      if (
        canLoop &&
        !hovered &&
        !focused &&
        !touching &&
        now >= manualPauseUntil.current
      ) {
        remainder += elapsed * 0.028;

        const distance = Math.floor(remainder);

        if (distance > 0) {
          remainder -= distance;

          let next = track.scrollLeft + distance;

          if (next >= cycleWidth) {
            next %= cycleWidth;
          }

          track.scrollLeft = next;
        }
      } else {
        remainder = 0;
      }

      frame = requestAnimationFrame(tick);
    };

    const sync = () => {
      stop();

      if (visible && !document.hidden && !reducedMotion.matches) {
        frame = requestAnimationFrame(tick);
      }
    };

    const pauseBriefly = () => {
      manualPauseUntil.current = performance.now() + 2500;
    };

    const mouseEnter = () => { hovered = true; };
    const mouseLeave = () => {
      hovered = false;
      pauseBriefly();
    };

    const focusIn = () => { focused = true; };
    const focusOut = (event: FocusEvent) => {
      focused = track.contains(event.relatedTarget as Node | null);
      pauseBriefly();
    };

    const touchStart = () => { touching = true; };
    const touchEnd = () => {
      touching = false;
      pauseBriefly();
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        sync();
      },
      { threshold: 0.1 }
    );

    const resize = new ResizeObserver(measure);

    measure();
    observer.observe(track);
    resize.observe(track);

    track.addEventListener("mouseenter", mouseEnter);
    track.addEventListener("mouseleave", mouseLeave);
    track.addEventListener("focusin", focusIn);
    track.addEventListener("focusout", focusOut);
    track.addEventListener("touchstart", touchStart, { passive: true });
    track.addEventListener("touchend", touchEnd, { passive: true });
    track.addEventListener("touchcancel", touchEnd, { passive: true });
    track.addEventListener("wheel", pauseBriefly, { passive: true });

    document.addEventListener("visibilitychange", sync);
    reducedMotion.addEventListener("change", sync);

    return () => {
      stop();
      observer.disconnect();
      resize.disconnect();

      track.removeEventListener("mouseenter", mouseEnter);
      track.removeEventListener("mouseleave", mouseLeave);
      track.removeEventListener("focusin", focusIn);
      track.removeEventListener("focusout", focusOut);
      track.removeEventListener("touchstart", touchStart);
      track.removeEventListener("touchend", touchEnd);
      track.removeEventListener("touchcancel", touchEnd);
      track.removeEventListener("wheel", pauseBriefly);

      document.removeEventListener("visibilitychange", sync);
      reducedMotion.removeEventListener("change", sync);
    };
  }, [isDiscover, catalog.length]);

  useEffect(() => {
    if (!preview) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPreview(null);
      }
    };

    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [preview]);

  function move(direction: number) {
    const track = trackRef.current;
    if (!track) return;

    manualPauseUntil.current = performance.now() + 2500;

    const card = track.querySelector<HTMLElement>(".skp-card");
    const width = card ? card.getBoundingClientRect().width : 240;
    const gap = parseFloat(getComputedStyle(track).columnGap) || 14;

    track.scrollBy({
      left: direction * (width + gap) * (window.innerWidth <= 640 ? 2 : 1),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
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
    if (product.variants.length > 0 ||
        product.pricingMode !== "FIXED") {
      window.location.assign(`/product/${product.id}`);
      return;
    }
    const added = addCatalogItem(
      product.id, undefined, product.stock
    );
    if (!added) stockNotice.show(product, product.stock);
                else stockNotice.clear();
                setMessage(added
      ? product.name + " added to cart."
      : stockLimitMessage(Math.min(20, product.stock)));
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
                    <Image
                      src={product.image}
                      alt={product.name}
                      fill
                      sizes="(max-width: 640px) 75vw, (max-width: 1024px) 45vw, 25vw"
                      loading="lazy"
                      style={{
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

                <StockIndicator
                  stock={product.stock}
                  status={product.availabilityStatus}
                  requiresOptions={product.variants.length > 0 || product.pricingMode === "LENGTH_OPTIONS"}
                  perMeter={product.pricingMode === "PER_METER"}
                />
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
              {preview.image ? (
                <Image
                  src={preview.image}
                  alt={preview.name}
                  width={720}
                  height={720}
                  decoding="async"
                  className="skp-dialog-product-image"
                />
              ) : (
                <>
                  <ImageIcon size={38} />
                  <span>Product image coming soon</span>
                </>
              )}
            </div>

            <h3>{preview.name}</h3>
            <strong>{preview.price > 0 ? `₹${preview.price.toLocaleString("en-IN")}` : "Price on request"}</strong>
          </div>
        </div>
      )}
    {stockNotice.element}</section>
  );
}
