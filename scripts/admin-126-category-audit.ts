import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

async function main() {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error("DATABASE_URL missing");
  }

  const prisma = new PrismaClient({
    adapter: new PrismaMariaDb(url),
  });

  try {
    const categories = await prisma.category.findMany({
      include: {
        _count: {
          select: { products: true },
        },
      },
      orderBy: [
        { sortOrder: "asc" },
        { name: "asc" },
      ],
    });

    console.log("\n===== CATEGORY COUNTS =====");

    for (const category of categories) {
      console.log(
        `${category.parentId ? "SUB " : "MAIN"} | ` +
        `${category.name} | ` +
        `Products: ${category._count.products} | ` +
        `Active: ${category.isActive}`
      );
    }

    const [total, active, featured] = await Promise.all([
      prisma.product.count(),
      prisma.product.count({
        where: { isActive: true },
      }),
      prisma.product.count({
        where: {
          isActive: true,
          isFeatured: true,
        },
      }),
    ]);

    console.log("\n===== PRODUCT SUMMARY =====");
    console.log("Total:", total);
    console.log("Active:", active);
    console.log("Featured:", featured);
    console.log("\nPASS: Read-only audit complete");

  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("AUDIT FAILED:", error.message);
  process.exitCode = 1;
});
