import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error("DATABASE_URL missing");
}

const parsed = new URL(url);

if (
  !["127.0.0.1", "localhost"].includes(parsed.hostname) ||
  decodeURIComponent(parsed.pathname.slice(1)) !==
    "srikalahasti_kalamkari"
) {
  throw new Error("STOP: Local development database only");
}

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(url),
});

async function main() {
  const products = await prisma.product.findMany({
    where: {
      slug: {
        contains: "-catalog-",
      },
      availabilityStatus: "COMING_SOON",
      stock: 0,
    },
    select: {
      id: true,
      slug: true,
    },
  });

  const targets = products.filter((p) =>
    /-catalog-\d+$/.test(p.slug)
  );

  console.log("Matching products:", targets.length);

  if (targets.length !== 208) {
    throw new Error(
      `STOP: Expected 208 products, found ${targets.length}`
    );
  }

  const result = await prisma.product.updateMany({
    where: {
      id: {
        in: targets.map((p) => p.id),
      },
      stock: 0,
      availabilityStatus: "COMING_SOON",
    },
    data: {
      stock: 2,
      availabilityStatus: "IN_STOCK",
    },
  });

  if (result.count !== 208) {
    throw new Error(
      `Unexpected update count: ${result.count}`
    );
  }

  console.log("PASS: Updated products:", result.count);
  console.log("Stock per product: 2");
  console.log("Availability: IN_STOCK");
  console.log("Existing 2 products: untouched");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
