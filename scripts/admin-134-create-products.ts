import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(process.env.DATABASE_URL!),
});

const priceRanges: Record<string, number> = {
  sarees: 2200,
  dupattas: 950,
  "running-fabrics": 450,
  lehengas: 3200,
  kurtas: 1100,
  "home-decor": 650,
};

async function main() {
  const categories = await prisma.category.findMany({
    include: {
      parent: true,
      _count: { select: { products: true } },
    },
  });

  let created = 0;

  for (const category of categories) {
    if (!category.parentId || !category.isActive) continue;

    const parent = category.parent;
    if (!parent?.isActive) continue;

    const existing = category._count.products;
    const needed = Math.max(0, 10 - existing);

    const basePrice = priceRanges[parent.slug] ?? 1200;

    for (let i = 1; i <= needed; i++) {
      const slug = `${category.slug}-catalog-${i}`;

      const exists = await prisma.product.findUnique({
        where: { slug },
      });

      if (exists) continue;

      await prisma.product.create({
        data: {
          name: `${category.name} Collection ${i}`,
          slug,
          description:
            `Preview catalog listing for ${category.name}. ` +
            `Final product details, images and availability ` +
            `must be confirmed before sale.`,
          shortDescription: "Catalog preview — details pending confirmation",
          categoryId: category.id,
          price: basePrice + i * 150,
          originalPrice: basePrice + i * 250,
          stock: 0,
          availabilityStatus: "COMING_SOON",
          images: [],
          isActive: true,
          isFeatured: i <= 2,
          isNewArrival: true,
          allowCOD: false,
          allowEnquiry: true,
        },
      });

      created++;
    }

    console.log(
      `${parent.name} → ${category.name}: ` +
      `${existing} existing, ${needed} planned`
    );
  }

  console.log("\nNEW PRODUCTS CREATED:", created);
  console.log("Existing products preserved.");
  console.log("Demo products checkout disabled through zero stock.");
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
