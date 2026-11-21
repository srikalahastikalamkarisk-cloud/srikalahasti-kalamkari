"use client";

import { useState } from "react";
import Link from "next/link";
import "./collections-fabrics.css";

const collections = [
  { title: "KALAMKARI SAREES", image: "/collections/sarees.jpg", href: "/collections/sarees" },
  { title: "HANDCRAFTED DUPATTAS", image: "/collections/dupattas.jpg", href: "/collections/dupattas" },
  { title: "HERITAGE LEHENGAS", image: "/collections/lehengas.jpg", href: "/collections/lehengas" },
  { title: "RUNNING FABRICS", image: "/collections/fabrics.jpg", href: "/collections/fabrics" },
  { title: "TRADITIONAL KURTAS", image: "/collections/kurtas.jpg", href: "/collections/kurtas" },
  { title: "KALAMKARI WALL ART", image: "/collections/wall-art.jpg", href: "/collections/wall-art" },
];

function CollectionCard({ item }: { item: typeof collections[number] }) {
  const [failed, setFailed] = useState(false);

  return (
    <Link href={item.href} className="sk-collection-v2-card">
      <div className="sk-collection-v2-arch-wrap">
        <div className="sk-collection-v2-finial" aria-hidden="true">♠</div>
        <div className="sk-collection-v2-arch">
          {!failed ? (
            <img
              src={item.image}
              alt={item.title}
              loading="lazy"
              onError={() => setFailed(true)}
            />
          ) : (
            <div className="sk-collection-v2-empty">
              <span>SRIKALAHASTI</span>
              <small>KALAMKARI</small>
            </div>
          )}
        </div>
      </div>
      <h3>{item.title}</h3>
    </Link>
  );
}

export default function CollectionsFabrics() {
  return (
    <section className="sk-collections-v2" aria-labelledby="collections-v2-title">
      <div className="sk-collections-v2-inner">
        <div className="sk-collections-v2-heading">
          <div>
            <p className="sk-collections-v2-eyebrow">THE SRIKALAHASTI ARCHIVE</p>
            <h2 id="collections-v2-title">
              Collections. <span>Timeless Fabrics</span>
            </h2>
          </div>
          <p className="sk-collections-v2-desc">
            Woven by tradition, cherished for generations.
            Six expressions of Kalamkari artistry.
          </p>
        </div>

        <div className="sk-collections-v2-grid">
          {collections.map((item) => (
            <CollectionCard key={item.title} item={item} />
          ))}
        </div>
      </div>
    </section>
  );
}
