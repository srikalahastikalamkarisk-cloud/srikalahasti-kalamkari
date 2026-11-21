import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

class ExpectedRollback extends Error {}

async function main() {
  const source = process.env.DATABASE_URL;
  if (!source) throw new Error("DATABASE_URL missing");

  const url = new URL(source);
  url.pathname = "/srikalahasti_availability_restore_test";

  const prisma = new PrismaClient({
    adapter: new PrismaMariaDb(url.toString()),
  });

  const tag = randomUUID();
  const orderNumber = `FULFILMENT-${tag}`;

  try {
    const db = await prisma.$queryRaw<
      Array<{ db: string; server: string; port: number }>
    >`
      SELECT DATABASE() AS db,
      @@hostname AS server,
      @@port AS port
    `;

    assert.equal(
      db[0]?.db,
      "srikalahasti_availability_restore_test"
    );

    console.log("DATABASE:", db[0]);

    try {
      await prisma.$transaction(async tx => {
        const order = await tx.order.create({
          data: {
            orderNumber,
            customerName: "Fulfilment Test",
            customerEmail: "fulfilment@example.invalid",
            customerPhone: "0000000000",
            address: "Isolated Test Address",
            city: "Test City",
            state: "Test State",
            pincode: "000000",
            subtotal: "500.00",
            totalAmount: "500.00",
            paymentStatus: "PAID",
            paidAt: new Date(),
            inventoryStatus: "DEDUCTED",
            inventoryDeductedAt: new Date(),
          },
        });

        async function advance(
          status: "PROCESSING" | "SHIPPED" | "DELIVERED",
          tracking?: {
            courierName: string;
            trackingNumber: string;
            trackingUrl: string;
          }
        ) {
          await tx.$queryRaw`
            SELECT id FROM \`Order\`
            WHERE id = ${order.id}
            FOR UPDATE
          `;

          const current = await tx.order.findUniqueOrThrow({
            where: { id: order.id },
          });

          assert.equal(current.paymentStatus, "PAID");
          assert.equal(current.inventoryStatus, "DEDUCTED");

          const next: Record<string, string> = {
            PENDING: "PROCESSING",
            PROCESSING: "SHIPPED",
            SHIPPED: "DELIVERED",
          };

          if (next[current.orderStatus] !== status) {
            throw new Error("Invalid order status transition");
          }

          if (
            status === "SHIPPED" &&
            (!tracking?.courierName || !tracking?.trackingNumber)
          ) {
            throw new Error("Courier details required");
          }

          return tx.order.update({
            where: { id: order.id },
            data: {
              orderStatus: status,
              ...(status === "SHIPPED"
                ? {
                    courierName: tracking!.courierName,
                    trackingNumber: tracking!.trackingNumber,
                    trackingUrl: tracking!.trackingUrl,
                    shippedAt: new Date(),
                  }
                : {}),
              ...(status === "DELIVERED"
                ? { deliveredAt: new Date() }
                : {}),
            },
          });
        }

        const processing = await advance("PROCESSING");
        assert.equal(processing.orderStatus, "PROCESSING");
        console.log("PASS: PENDING -> PROCESSING");

        const shipped = await advance("SHIPPED", {
          courierName: "Test Courier",
          trackingNumber: `TRACK-${tag}`,
          trackingUrl: "https://example.com/track",
        });

        assert.equal(shipped.orderStatus, "SHIPPED");
        assert.equal(shipped.courierName, "Test Courier");
        assert.equal(shipped.trackingNumber, `TRACK-${tag}`);
        assert.ok(shipped.shippedAt);
        console.log("PASS: PROCESSING -> SHIPPED");
        console.log("PASS: Courier and tracking saved");
        console.log("PASS: Shipment timestamp saved");

        const delivered = await advance("DELIVERED");

        assert.equal(delivered.orderStatus, "DELIVERED");
        assert.ok(delivered.deliveredAt);
        assert.equal(delivered.paymentStatus, "PAID");
        assert.equal(delivered.inventoryStatus, "DEDUCTED");

        console.log("PASS: SHIPPED -> DELIVERED");
        console.log("PASS: Delivery timestamp saved");
        console.log("PASS: Payment and inventory preserved");

        await assert.rejects(
          advance("PROCESSING"),
          /Invalid order status transition/
        );

        console.log("PASS: Invalid reverse transition rejected");

        throw new ExpectedRollback("ROLLBACK_TEST_DATA");
      });
    } catch (error) {
      if (!(error instanceof ExpectedRollback)) throw error;
    }

    const remaining = await prisma.order.count({
      where: { orderNumber },
    });

    assert.equal(remaining, 0);

    console.log("PASS: Test order rolled back");
    console.log("PASS: All fulfilment database scenarios completed");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(error => {
  console.error("FAIL:", error);
  process.exitCode = 1;
});
