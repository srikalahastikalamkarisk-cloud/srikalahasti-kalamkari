import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaMariaDb(process.env.DATABASE_URL!),
  });

  try {
    const categories = await prisma.category.findMany({
      include: {
        parent: { select: { name: true } },
        children: { select: { id: true, name: true } },
        products: {
          select: {
            id: true,
            name: true,
            price: true,
            stock: true,
            isActive: true,
            availabilityStatus: true,
          },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    console.log("\n===== MAIN CATEGORY STRUCTURE =====");

    for (const main of categories.filter(c => !c.parentId)) {
      console.log(`\n${main.name} (${main.id})`);

      for (const sub of main.children) {
        const detail = categories.find(c => c.id === sub.id);
        console.log(
          `  ${sub.name} | ID: ${sub.id} | ` +
          `Products: ${detail?.products.length ?? 0}`
        );

        for (const p of detail?.products ?? []) {
          console.log(
            `    ${p.name} | ₹${p.price} | Stock: ${p.stock} | ${p.availabilityStatus}`
          );
        }
      }

      if (!main.children.length) {
        console.log("  WARNING: No subcategory");
      }
    }

    const total = await prisma.product.count();
    const subs = categories.filter(c => c.parentId);

    console.log("\n===== SUMMARY =====");
    console.log("Subcategories:", subs.length);
    console.log("Existing products:", total);
    console.log("Target products:", subs.length * 10);
    console.log(
      "Additional products required:",
      Math.max(0, subs.length * 10 - total)
    );
    console.log("\nPASS: Read-only verification");

  } finally {
    await prisma.$disconnect();
  }
}

main().catch(e => {
  console.error("STOP:", e.message);
  process.exitCode = 1;
});
