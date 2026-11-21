import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import Module from "node:module";

const moduleLoader = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};

const originalLoad = moduleLoader._load;

async function loadInventoryHelper() {
  moduleLoader._load = function(request, parent, isMain) {
    if (request === "server-only") return {};
    return originalLoad(request, parent, isMain);
  };

  try {
    return await import("../src/lib/payments/deduct-order-inventory");
  } finally {
    moduleLoader._load = originalLoad;
  }
}

class RollbackTest extends Error {}

async function main() {
  const { deductOrderInventory } = await loadInventoryHelper();
  const source = process.env.DATABASE_URL;
  if (!source) throw new Error("DATABASE_URL missing");

  const url = new URL(source);
  const target = "srikalahasti_availability_restore_test";

  if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error("STOP: Non-local database");
  }

  url.pathname = `/${target}`;

  const prisma = new PrismaClient({
    adapter: new PrismaMariaDb(url.toString())
  });

  try {
    const db = await prisma.$queryRaw<Array<{ db: string }>>`
      SELECT DATABASE() AS db
    `;

    assert.equal(db[0]?.db, target);

    const category = await prisma.category.findFirst({
      select: { id: true }
    });

    assert.ok(category, "Test category missing");

    const tag = randomUUID().replaceAll("-", "");

    try {
      await prisma.$transaction(async tx => {
        const product = await tx.product.create({
          data: {
            name: `Cancellation Test ${tag}`,
            slug: `cancellation-test-${tag}`,
            categoryId: category.id,
            price: "100.00",
            stock: 5,
            isActive: true,
            availabilityStatus: "IN_STOCK",
            pricingMode: "FIXED"
          }
        });

        const order = await tx.order.create({
          data: {
            orderNumber: `TEST-CANCEL-${tag}`,
            customerName: "Cancellation Test",
            customerEmail: "cancel-test@example.invalid",
            customerPhone: "0000000000",
            address: "Test Address",
            city: "Test City",
            state: "Test State",
            pincode: "000000",
            subtotal: "200.00",
            totalAmount: "200.00",
            orderStatus: "CANCELLED",
            paymentStatus: "UNPAID",
            inventoryStatus: "PENDING",
            items: {
              create: {
                productId: product.id,
                productName: product.name,
                quantity: 2,
                unitPrice: "100.00",
                totalPrice: "200.00"
              }
            }
          }
        });

        await tx.$queryRaw`
          SELECT id FROM \`Order\`
          WHERE id = ${order.id}
          FOR UPDATE
        `;

        const result = await deductOrderInventory(tx, order.id);

        assert.notEqual(
          result,
          "DEDUCTED",
          "Cancelled order must never deduct inventory"
        );

        const after = await tx.product.findUniqueOrThrow({
          where: { id: product.id }
        });

        assert.equal(after.stock, 5);

        console.log("PASS: Cancelled order inventory deduction blocked");
        console.log("PASS: Product stock unchanged (5)");
        console.log("Inventory result:", result);

        throw new RollbackTest("ROLLBACK_TEST_DATA");
      });
    } catch (error) {
      if (!(error instanceof RollbackTest)) throw error;
    }

    const remaining = await prisma.product.count({
      where: { slug: `cancellation-test-${tag}` }
    });

    assert.equal(remaining, 0);
    console.log("PASS: Test data rolled back");

  } finally {
    await prisma.$disconnect();
  }
}

main().catch(error => {
  console.error("FAIL:", error);
  process.exitCode = 1;
});
