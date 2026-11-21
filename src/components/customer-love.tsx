"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Star, X } from "lucide-react";
import type {
  HomepageCustomerPhoto,
  HomepageCustomerReview,
} from "@/lib/customer-love";
import "./customer-love.css";

type Props = {
  photos: HomepageCustomerPhoto[];
  reviews: HomepageCustomerReview[];
};

function useAutoScroll<T extends HTMLElement>(enabled: boolean) {
  const ref = useRef<T>(null);
  const paused = useRef(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || !enabled) return;

    const first = element.firstElementChild as HTMLElement | null;
    if (!first) return;

    const measure = () => {
      const cardWidth = first.getBoundingClientRect().width;
      const gap = parseFloat(getComputedStyle(element).gap) || 0;
      const originalCount = Math.floor(element.children.length / 4);
      const distance = originalCount * (cardWidth + gap);
      const mobile = window.matchMedia("(max-width: 650px)").matches;
      const speed = mobile ? 30 : 40;

      element.style.setProperty(
        "--clp-panel-width",
        `${element.parentElement?.clientWidth ?? 680}px`
      );
      element.style.setProperty("--clp-distance", `${distance}px`);
      element.style.setProperty("--clp-duration", `${distance / speed}s`);
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);

    return () => observer.disconnect();
  }, [enabled]);

  return { ref, paused };
}

export default function CustomerLove({ photos, reviews }: Props) {
  const [activeReview, setActiveReview] =
    useState<HomepageCustomerReview | null>(null);

  const gallery = useAutoScroll<HTMLDivElement>(photos.length > 0);
  const reviewTrack = useAutoScroll<HTMLDivElement>(reviews.length > 0);

  useEffect(() => {
    if (!activeReview) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveReview(null);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeReview]);

  const repeatedPhotos = photos.length ? [...photos, ...photos, ...photos, ...photos] : photos;
  const repeatedReviews = reviews.length ? [...reviews, ...reviews, ...reviews, ...reviews] : reviews;

  return (
    <section className="clp-section" aria-labelledby="clp-title">
      <div className="clp-shell">
        <header className="clp-heading">
          <span className="clp-eyebrow">✦ THE SRIKALAHASTI EDIT ✦</span>
          <h2 id="clp-title">
            Loved by <em>Our Customers.</em>
          </h2>
          <p>Traditional artistry. Meaningful moments.</p>
        </header>

        <div className="clp-columns">
          <div className="clp-panel">
            <div className="clp-panel-head">
              <span>01 / THE GALLERY</span>
              <h3>Worn with <em>Love.</em></h3>
            </div>

            {photos.length ? (
              <div
                className="clp-viewport clp-gallery"
                aria-label="Customer photo gallery"
                tabIndex={0}
              >
                <div ref={gallery.ref} className="clp-inner-track">
                {repeatedPhotos.map((photo, index) => (
                  <figure
                    className="clp-photo"
                    key={`${photo.id}-${index}`}
                    aria-hidden={index >= photos.length}
                  >
                    <Image
                      src={photo.src}
                      alt={index < photos.length ? photo.alt : ""}
                      fill
                      unoptimized
                      sizes="(max-width: 650px) 45vw, 13vw"
                      style={{ objectFit: "cover" }}
                    />
                    {photo.caption && (
                      <figcaption>{photo.caption}</figcaption>
                    )}
                  </figure>
                ))}
                </div>
              </div>
            ) : (
              <div className="clp-empty">
                <span>✦</span>
                <h4>Our Gallery Is Growing</h4>
                <p>Approved customer photographs will appear here.</p>
              </div>
            )}

            <p className="clp-note">
              Heritage beautifully worn <span>✦</span> Moments worth keeping
            </p>
          </div>

          <div className="clp-panel">
            <div className="clp-panel-head">
              <span>02 / THEIR WORDS</span>
              <h3>Stories of <em>Trust.</em></h3>
            </div>

            {reviews.length ? (
              <div
                className="clp-viewport clp-review-list"
                aria-label="Customer reviews"
                tabIndex={0}
              >
                <div ref={reviewTrack.ref} className="clp-inner-track">
                {repeatedReviews.map((review, index) => (
                  <button
                    type="button"
                    className="clp-review"
                    key={`${review.id}-${index}`}
                    aria-hidden={index >= reviews.length}
                    tabIndex={index >= reviews.length ? -1 : 0}
                    onClick={() => setActiveReview(review)}
                    aria-label={`Read full review by ${review.name}`}
                  >
                    <span className="clp-quote" aria-hidden="true">“</span>
                    <span className="clp-stars" aria-label={`${review.rating} out of 5 stars`}>
                      {Array.from({ length: 5 }, (_, i) => (
                        <Star
                          key={i}
                          size={11}
                          fill={i < review.rating ? "currentColor" : "none"}
                        />
                      ))}
                    </span>
                    <span className="clp-review-text">{review.text}</span>
                    <span className="clp-review-author">
                      <span className="clp-avatar">
                        {review.name.charAt(0).toUpperCase()}
                      </span>
                      <span className="clp-author-info">
                        <strong>{review.name}</strong>
                        {review.verified && <small>✓ Verified customer</small>}
                      </span>
                    </span>
                    <span className="clp-read-more">READ STORY +</span>
                  </button>
                ))}
                </div>
              </div>
            ) : (
              <div className="clp-empty">
                <span>✦</span>
                <h4>Every Story Matters</h4>
                <p>Approved customer feedback will appear here.</p>
              </div>
            )}

            <p className="clp-note">
              Every story matters <span>✦</span> Shared with gratitude
            </p>
          </div>
        </div>

        <div className="clp-bottom">
          HANDCRAFTED WITH HEART · CHERISHED FOR GENERATIONS
        </div>
      </div>

      {activeReview && (
        <div
          className="clp-modal-backdrop"
          onMouseDown={event => {
            if (event.target === event.currentTarget) {
              setActiveReview(null);
            }
          }}
        >
          <div
            className="clp-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Review by ${activeReview.name}`}
          >
            <button
              type="button"
              className="clp-modal-close"
              onClick={() => setActiveReview(null)}
              aria-label="Close review"
              autoFocus
            >
              <X size={20} />
            </button>
            <span className="clp-modal-kicker">CUSTOMER STORY</span>
            <div className="clp-modal-stars">
              {"★".repeat(Math.max(0, Math.min(5, activeReview.rating)))}
            </div>
            <p>“{activeReview.text}”</p>
            <strong>{activeReview.name}</strong>
            {activeReview.verified && (
              <small>✓ Verified customer</small>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
