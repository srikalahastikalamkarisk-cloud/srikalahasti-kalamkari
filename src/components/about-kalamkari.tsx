import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import {
  defaultAboutKalamkariContent,
  type AboutKalamkariContent,
} from "@/lib/about-kalamkari-content";
import "./about-kalamkari.css";

type AboutCategory = {
  id: string;
  name: string;
  href: string;
};

type Props = {
  content?: AboutKalamkariContent;
  categories?: AboutCategory[];
};

export default function AboutKalamkari({
  content = defaultAboutKalamkariContent,
  categories = [],
}: Props) {
  const headingParts = content.heading.trim().split(/\s+/);
  const headingFirst = headingParts.shift() || "About";
  const headingRest = headingParts.join(" ");

  return (
    <section className="sk-about" aria-labelledby="sk-about-title">
      <div className="sk-about-inner">
        <div className="sk-about-visual">
          <div className="sk-about-arch-frame">
            <div
              className="sk-about-arch-image"
              role="img"
              aria-label={content.imageAlt}
              style={content.imageUrl
                ? { backgroundImage: `url("${content.imageUrl}")` }
                : undefined}
            />
          </div>
          <p className="sk-about-image-note">{content.imageCaption}</p>
        </div>

        <div className="sk-about-content">
          <p className="sk-about-eyebrow">{content.eyebrow}</p>
          <h2 id="sk-about-title">
            {headingFirst} {headingRest && <em>{headingRest}</em>}
          </h2>
          <div className="sk-about-ornament" aria-hidden="true">
            <span>✦</span>
          </div>
          <p className="sk-about-copy">{content.descriptionOne}</p>
          <p className="sk-about-copy">{content.descriptionTwo}</p>

          <nav
            className="sk-about-categories"
            aria-label="Explore Kalamkari categories"
          >
            {categories.map(category => (
              <Link href={category.href} key={category.id}>
                {category.name}
              </Link>
            ))}
          </nav>

          <Link href={content.buttonHref} className="sk-about-button">
            <span>{content.buttonText}</span>
            <span className="sk-about-button-icon" aria-hidden="true"><ArrowUpRight size={18} /></span>
          </Link>
        </div>
      </div>
    </section>
  );
}
