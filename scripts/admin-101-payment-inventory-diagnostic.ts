import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

async function main() {
  const source = process.env.DATABASE_URL;
  if (!source) throw new Error("DATABASE_URL missing");

  const url = new URL(source);
  const prisma = new PrismaClient({
    adapter: new PrismaMariaDb(url.toString()),
  });

  try {
    const db = await prisma.$queryRaw<Array<{ db: string }>>`
      SELECT DATABASE() AS db
    `;
    console.log("DATABASE:", db[0].db);

    const orders = await prisma.order.findMany({
      take: 20,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        orderNumber: true,
        orderStatus: true,
        paymentStatus: true,
        inventoryStatus: true,
        paidAt: true,
        inventoryDeductedAt: true,
        items: {
          select: {
            productId: true,
            productName: true,
            quantity: true,
          },
        },
      },
    });

    const ids = [
      ...new Set(orders.flatMap(o =>
        o.items.map(i => i.productId)
      )),
    ];

    const products = await prisma.product.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        name: true,
        stock: true,
        availabilityStatus: true,
        isActive: true,
        pricingMode: true,
      },
    });

    const productMap = new Map(
      products.map(p => [p.id, p])
    );

    console.log("\n===== RECENT ORDER DIAGNOSIS =====");

    for (const order of orders) {
      console.log("\nORDER:", order.orderNumber);
      console.log({
        orderStatus: order.orderStatus,
        paymentStatus: order.paymentStatus,
        inventoryStatus: order.inventoryStatus,
        paidAt: order.paidAt,
        inventoryDeductedAt: order.inventoryDeductedAt,
      });

      for (const item of order.items) {
        const product = productMap.get(item.productId);

        console.log({
          product: item.productName,
          orderedQuantity: item.quantity,
          stock: product?.stock ?? "PRODUCT MISSING",
          availability: product?.availabilityStatus,
          isActive: product?.isActive,
          pricingMode: product?.pricingMode,
        });
      }
    }

    console.log("\nPASS: READ-ONLY DIAGNOSTIC COMPLETE");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(error => {
  console.error("FAIL:", error.message);
  process.exitCode = 1;
});
