import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
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

  try {
    const db = await prisma.$queryRaw<
      Array<{ db: string }>
    >`SELECT DATABASE() AS db`;

    assert.equal(
      db[0]?.db,
      "srikalahasti_availability_restore_test"
    );

    const migration = readFileSync(
      "prisma/migrations/20261117201000_legacy_paid_inventory_protection/migration.sql",
      "utf8"
    );

    const sql = migration
      .split("\n")
      .filter(line => !line.trim().startsWith("--"))
      .join("\n")
      .trim()
      .replace(/;$/, "");

    assert.match(sql, /^UPDATE `Order`/);

    const makeOrder = (
      paymentStatus: string,
      suffix: string
    ) => ({
      orderNumber: `LEGACY-${suffix}-${tag}`,
      customerName: "Legacy Test",
      customerEmail: "legacy@example.invalid",
      customerPhone: "0000000000",
      address: "Test Address",
      city: "Test City",
      state: "Test State",
      pincode: "000000",
      subtotal: "100.00",
      totalAmount: "100.00",
      paymentStatus,
      inventoryStatus: "PENDING",
    });

    try {
      await prisma.$transaction(async tx => {
        const paid = await tx.order.create({
          data: makeOrder("PAID", "PAID"),
        });

        const unpaid = await tx.order.create({
          data: makeOrder("UNPAID", "UNPAID"),
        });

        await tx.$executeRawUnsafe(sql);

        const paidAfter = await tx.order.findUniqueOrThrow({
          where: { id: paid.id },
        });

        const unpaidAfter = await tx.order.findUniqueOrThrow({
          where: { id: unpaid.id },
        });

        assert.equal(
          paidAfter.inventoryStatus,
          "LEGACY_PAID"
        );

        assert.equal(
          unpaidAfter.inventoryStatus,
          "PENDING"
        );

        assert.equal(
          paidAfter.inventoryDeductedAt,
          null
        );

        console.log("PASS: PAID -> LEGACY_PAID");
        console.log("PASS: UNPAID remains PENDING");
        console.log("PASS: No deduction timestamp created");

        throw new ExpectedRollback("ROLLBACK_TEST_DATA");
      });
    } catch (error) {
      if (!(error instanceof ExpectedRollback)) {
        throw error;
      }
    }

    const remaining = await prisma.order.count({
      where: {
        orderNumber: {
          startsWith: "LEGACY-",
          endsWith: tag,
        },
      },
    });

    assert.equal(remaining, 0);

    console.log("PASS: Temporary orders rolled back");
    console.log("PASS: Historical migration behavior verified");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(error => {
  console.error("FAIL:", error);
  process.exitCode = 1;
});
