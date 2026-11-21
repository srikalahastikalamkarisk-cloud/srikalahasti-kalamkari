import Image from "next/image";
import Link from "next/link";
import { fabrics } from "@/lib/fabric-collections";
import "./collections-and-fabrics.css";

export default function CollectionsAndFabrics() {
  return (
    <section className="skcf-section" aria-labelledby="collections-title">
      <div className="skcf-container">
        <header className="skcf-header">
          <div>
            <p className="skcf-eyebrow">THE SRIKALAHASTI EDIT</p>
            <h2 id="collections-title" className="skcf-title">
              Collections <em>&amp; Fabrics</em>
            </h2>
          </div>
          <p className="skcf-description">
            Explore our handpicked fabric collections, from
            Kanchipattu silks to cotton, linen and Pochampally.
          </p>
        </header>

        <div className="skcf-grid">
          {fabrics.map((fabric) => (
            <Link
              href={`/shop?q=${encodeURIComponent(fabric.name)}`}
              className="skcf-card"
              key={fabric.slug}
            >
              <div className="skcf-arch">
                <Image
                  src={`/fabrics/${fabric.slug}.jpg`}
                  alt={`${fabric.name} fabric illustration`}
                  fill
                  sizes="(max-width:600px) 50vw, (max-width:1000px) 33vw, 16vw"
                  className="skcf-image"
                />
                <span className="skcf-outline" aria-hidden="true" />
              </div>
              <h3 className="skcf-name">{fabric.name}</h3>
              <span className="skcf-explore">EXPLORE COLLECTION</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
