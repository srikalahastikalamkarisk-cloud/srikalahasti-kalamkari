import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { heritageCTA } from "@/data/heritage-cta";
import "./heritage-cta.css";

export default function HeritageCTA() {
  const cta = heritageCTA;

  return (
    <section className="sk-heritage-cta" aria-labelledby="sk-heritage-title">
      <div className="sk-heritage-container">
        <div className="sk-heritage-top">
          <div className="sk-heritage-copy">
            <span className="sk-heritage-eyebrow">
              <span className="sk-heritage-eyebrow-line" />
              {cta.eyebrow}
            </span>

            <h2 id="sk-heritage-title">
              {cta.heading}
              <br />
              <em>{cta.headingAccent}</em>
            </h2>
          </div>

          <p className="sk-heritage-description">
            {cta.description}
          </p>
        </div>

        <div className="sk-heritage-gallery">
          <div className="sk-heritage-main-image">
            <div
              className="sk-heritage-image-bg"
              style={{ backgroundImage: `url("${cta.images.main}")` }}
            />
            <div className="sk-heritage-image-label">
              <span>01 / THE HERITAGE EDIT</span>
            </div>
          </div>

          <div className="sk-heritage-side">
            <div className="sk-heritage-side-image">
              <div
                className="sk-heritage-image-bg"
                style={{ backgroundImage: `url("${cta.images.fabric}")` }}
              />
              <span>THE ART OF TEXTILES</span>
            </div>

            <div className="sk-heritage-side-image">
              <div
                className="sk-heritage-image-bg"
                style={{ backgroundImage: `url("${cta.images.craft}")` }}
              />
              <span>CRAFTED BY HAND</span>
            </div>
          </div>
        </div>

        <div className="sk-heritage-footer">
          <div className="sk-heritage-footer-copy">
            <span className="sk-heritage-footer-mark">✦</span>
            <p>Rooted in tradition. Made to be treasured.</p>
          </div>

          <Link href={cta.buttonHref} className="sk-heritage-button">
            {cta.buttonText}
            <span className="sk-heritage-button-icon">
              <ArrowUpRight size={17} strokeWidth={1.7} />
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}
