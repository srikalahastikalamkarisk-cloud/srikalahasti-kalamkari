import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import "./shop-by-category.css";

export default async function ShopByCategory() {
  const categories = await prisma.category.findMany({
    where: {
      isActive: true,
      parentId: null,
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      image: true,
    },
  });

  return (
    <section
      className="sk-category-section"
      aria-labelledby="sk-category-heading"
    >
      <div className="sk-category-container">
        <div className="sk-category-heading">
          <span className="sk-category-eyebrow">
            DISCOVER OUR COLLECTIONS
          </span>

          <h2 id="sk-category-heading">
            Shop by Category
          </h2>

          <div
            className="sk-category-ornament"
            aria-hidden="true"
          >
            <span />
            <b>✦</b>
            <span />
          </div>

          <p>
            Timeless artistry, thoughtfully curated for you.
          </p>
        </div>

        <div className="sk-category-grid">
          {categories.map((category) => (
            <Link
              key={category.id}
              href={`/${encodeURIComponent(category.slug)}`}
              className="sk-category-item"
              aria-label={`Shop ${category.name}`}
            >
              <div className="sk-category-frame">
                <div className="sk-category-photo">
                  {category.image ? (
                    category.image.startsWith("/uploads/categories/") ? (
                      <Image
                        src={category.image}
                        alt={category.name}
                        fill
                        unoptimized
                        sizes="(max-width: 640px) 30vw, (max-width: 1024px) 22vw, 160px"
                        className="sk-category-image"
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={category.image}
                        alt={category.name}
                        className="sk-category-image"
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                    )
                  ) : (
                    <div className="sk-category-placeholder">
                      <span aria-hidden="true">✿</span>
                    </div>
                  )}
                </div>
              </div>

              <span className="sk-category-name">
                {category.name}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
