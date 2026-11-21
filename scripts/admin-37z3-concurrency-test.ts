import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Module from "node:module";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

async function main() {
  const source = process.env.DATABASE_URL;
  if (!source) throw new Error("DATABASE_URL missing");

  const url = new URL(source);
  url.pathname = "/srikalahasti_availability_restore_test";

  const prisma = new PrismaClient({
    adapter: new PrismaMariaDb(url.toString()),
  });

  const moduleLoader = Module as unknown as {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown;
  };
  const originalLoad = moduleLoader._load;

  moduleLoader._load = function(
    request: string,
    parent: unknown,
    isMain: boolean
  ) {
    if (request === "server-only") return {};
    return originalLoad(request, parent, isMain);
  };

  let deductOrderInventory: typeof import("../src/lib/payments/deduct-order-inventory").deductOrderInventory;

  try {
    ({ deductOrderInventory } = await import(
      "../src/lib/payments/deduct-order-inventory"
    ));
  } finally {
    moduleLoader._load = originalLoad;
  }

  const tag = randomUUID();
  let productId: string | undefined;
  const orderIds: string[] = [];

  try {
    const db = await prisma.$queryRaw<Array<{ db: string }>>`
      SELECT DATABASE() AS db
    `;
    assert.equal(db[0]?.db, "srikalahasti_availability_restore_test");

    const category = await prisma.category.findFirst({
      select: { id: true },
    });
    assert.ok(category);

    const product = await prisma.product.create({
      data: {
        name: "Concurrency Test Product",
        slug: `concurrency-${tag}`,
        categoryId: category.id,
        price: "100.00",
        stock: 5,
        isActive: true,
        availabilityStatus: "IN_STOCK",
        pricingMode: "FIXED",
      },
    });

    productId = product.id;

    for (let i = 1; i <= 2; i++) {
      const order = await prisma.order.create({
        data: {
          orderNumber: `CONCURRENT-${i}-${tag}`,
          customerName: "Concurrency Test",
          customerEmail: "concurrency@example.invalid",
          customerPhone: "0000000000",
          address: "Test Address",
          city: "Test City",
          state: "Test State",
          pincode: "000000",
          subtotal: "400.00",
          totalAmount: "400.00",
          inventoryStatus: "PENDING",
          items: {
            create: {
              productId: product.id,
              productName: product.name,
              quantity: 4,
              unitPrice: "100.00",
              totalPrice: "400.00",
            },
          },
        },
      });
      orderIds.push(order.id);
    }

    const processOrder = (orderId: string) =>
      prisma.$transaction(
        async tx => {
          await tx.$queryRaw`
            SELECT id FROM \`Order\`
            WHERE id = ${orderId}
            FOR UPDATE
          `;
          return deductOrderInventory(tx, orderId);
        },
        {
          maxWait: 10000,
          timeout: 20000,
          isolationLevel: "ReadCommitted",
        }
      );

    const results = await Promise.all(
      orderIds.map(processOrder)
    );

    const stock = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      select: { stock: true },
    });
    const movements = await prisma.inventoryMovement.findMany({
      where: { productId: product.id },
      select: { movementType: true, quantityChange: true, quantityBefore: true, quantityAfter: true },
    });

    console.log("Order results:", results);
    console.log("Final stock:", stock.stock);

    assert.equal(
      results.filter(x => x === "DEDUCTED").length,
      1
    );
    assert.equal(
      results.filter(x => x === "REVIEW_REQUIRED").length,
      1
    );
    assert.equal(stock.stock, 1);
    assert.deepEqual(movements, [{
      movementType: "ORDER_DEDUCTION",
      quantityChange: -4,
      quantityBefore: 5,
      quantityAfter: 1,
    }]);

    console.log("PASS: Concurrent orders did not oversell.");
    console.log("PASS: Exactly one stock movement was recorded.");
  } finally {
    try {
      const cleanupDb = await prisma.$queryRaw<Array<{ db: string }>>`SELECT DATABASE() AS db`;
      assert.equal(cleanupDb[0]?.db, "srikalahasti_availability_restore_test", "Refusing test cleanup outside isolated database");

      if (productId || orderIds.length) {
        await prisma.inventoryMovement.deleteMany({
          where: {
            OR: [
              ...(productId ? [{ productId }] : []),
              ...(orderIds.length ? [{ referenceId: { in: orderIds } }] : []),
            ],
          },
        });
      }
      if (orderIds.length) {
        await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
      }
      if (productId) {
        await prisma.product.delete({ where: { id: productId } });
      }
    } finally {
      await prisma.$disconnect();
    }
  }
}

main().catch(error => {
  console.error("FAIL:", error);
  process.exitCode = 1;
});
