import Link from "next/link";
import { prisma } from "@/lib/prisma";
import "./home-seo-intro.css";

export default async function HomeSeoIntro() {
  const categories = await prisma.category.findMany({
    where: {
      isActive: true,
      parentId: null,
      OR: [
        { products: { some: { isActive: true } } },
        { children: { some: { isActive: true, products: { some: { isActive: true } } } } },
      ],
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, slug: true },
  });
  return <section className="sk-home-seo" aria-labelledby="sk-home-seo-title">
    <div className="sk-home-seo__inner">
      <p className="sk-home-seo__eyebrow">SRIKALAHASTI KALAMKARI</p>
      <h2 id="sk-home-seo-title">A living tradition, drawn by hand</h2>
      <p>Srikalahasti Kalamkari is known for freehand pen-drawn designs and carefully applied colour. Explore the pieces currently available, and see each product page for its own material, technique and availability details.</p>
      <nav aria-label="Shop product categories"><Link href="/shop">Shop all available pieces</Link>{categories.map(category => <Link href={`/${encodeURIComponent(category.slug)}`} key={category.id}>{category.name}</Link>)}</nav>
    </div>
  </section>;
}
