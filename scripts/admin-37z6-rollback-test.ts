import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
// Load the server-only helper through a test-only module shim.
import Module from "node:module";

const moduleLoader = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = moduleLoader._load;

moduleLoader._load = function(request, parent, isMain) {
  if (request === "server-only") return {};
  return originalLoad(request, parent, isMain);
};

async function loadInventoryHelper() {
  try {
    return await import(
      "../src/lib/payments/deduct-order-inventory"
    );
  } finally {
    moduleLoader._load = originalLoad;
  }
}

class ExpectedRollback extends Error {}

async function main() {
  const { deductOrderInventory } = await loadInventoryHelper();
  const source = process.env.DATABASE_URL;
  if (!source) throw new Error("DATABASE_URL missing");

  const url = new URL(source);
  url.pathname = "/srikalahasti_availability_restore_test";

  const prisma = new PrismaClient({
    adapter: new PrismaMariaDb(url.toString()),
  });

  try {
    const db = await prisma.$queryRaw<Array<{ db: string }>>`
      SELECT DATABASE() AS db
    `;

    assert.equal(
      db[0]?.db,
      "srikalahasti_availability_restore_test"
    );

    const category = await prisma.category.findFirst({
      select: { id: true },
    });

    assert.ok(category, "Test category missing");

    const tag = randomUUID();

    try {
      await prisma.$transaction(async tx => {
        const product = await tx.product.create({
          data: {
            name: "Inventory Transaction Test",
            slug: `inventory-test-${tag}`,
            categoryId: category.id,
            price: "100.00",
            stock: 5,
            isActive: true,
            availabilityStatus: "IN_STOCK",
            pricingMode: "FIXED",
          },
        });

        const secondProduct = await tx.product.create({
          data: {
            name: "Rollback Test Second Product",
            slug: `rollback-second-${tag}`,
            categoryId: category.id,
            price: "100.00",
            stock: 5,
            isActive: true,
            availabilityStatus: "IN_STOCK",
            pricingMode: "FIXED",
          },
        });

        const order = await tx.order.create({
          data: {
            orderNumber: `TEST-${tag}`,
            customerName: "Inventory Test",
            customerEmail: "inventory-test@example.invalid",
            customerPhone: "0000000000",
            address: "Test Address",
            city: "Test City",
            state: "Test State",
            pincode: "000000",
            subtotal: "200.00",
            totalAmount: "200.00",
            paymentStatus: "UNPAID",
            inventoryStatus: "PENDING",
            items: {
              create: [
                {
                  productId: product.id,
                  productName: product.name,
                  quantity: 2,
                  unitPrice: "100.00",
                  totalPrice: "200.00",
                },
                {
                  productId: secondProduct.id,
                  productName: secondProduct.name,
                  quantity: 2,
                  unitPrice: "100.00",
                  totalPrice: "200.00",
                },
              ],
            },
          },
        });

        await tx.$queryRaw`
          SELECT id FROM \`Order\`
          WHERE id = ${order.id}
          FOR UPDATE
        `;

        // Inject failure on the second stock update only.
        const originalUpdateMany = tx.product.updateMany;
        let updateCount = 0;

        const testTx = {
          ...tx,
          product: {
            ...tx.product,
            updateMany: async (args: Parameters<typeof tx.product.updateMany>[0]) => {
              updateCount++;

              if (updateCount === 2) {
                throw new Error("TEST_INJECTED_SECOND_UPDATE_FAILURE");
              }

              const result = await originalUpdateMany.call(tx.product, args);

              if (updateCount === 1) {
                assert.equal(result.count, 1);

                const updatedProduct = await tx.product.findUniqueOrThrow({
                  where: { id: args.where?.id as string },
                  select: { stock: true },
                });

                assert.equal(updatedProduct.stock, 3);
                console.log("PASS: First product stock decreased 5 -> 3");
              }

              return result;
            },
          },
        };

        try {
          await deductOrderInventory(
            testTx as unknown as Parameters<typeof deductOrderInventory>[0],
            order.id
          );
          assert.fail("Expected injected failure");
        } catch (error) {
          assert.match(
            String(error),
            /TEST_INJECTED_SECOND_UPDATE_FAILURE/
          );
          assert.equal(updateCount, 2);
          console.log("PASS: Second update failure injected");
        }

        // Throw outside the transaction callback so MySQL rolls back.
        throw new ExpectedRollback("ROLLBACK_TEST_DATA");
      });
    } catch (error) {
      if (!(error instanceof ExpectedRollback)) throw error;
    }

    const remaining = await prisma.product.count({
      where: { slug: `inventory-test-${tag}` },
    });

    const remainingOrders = await prisma.order.count({
      where: { orderNumber: `TEST-${tag}` },
    });

    assert.equal(remaining, 0);
    assert.equal(remainingOrders, 0);

    console.log("PASS: Test product rolled back");
    console.log("PASS: Test order rolled back");
    console.log("PASS: Isolated transaction test complete");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(error => {
  console.error("FAIL:", error);
  process.exitCode = 1;
});
