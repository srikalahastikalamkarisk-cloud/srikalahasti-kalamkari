import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

async function main() {
  const source = process.env.DATABASE_URL;

  if (!source) {
    throw new Error("DATABASE_URL missing.");
  }

  const url = new URL(source);
  url.pathname = "/srikalahasti_availability_restore_test";

  const prisma = new PrismaClient({
    adapter: new PrismaMariaDb(url.toString()),
  });

  try {
    const db = await prisma.$queryRaw<
      Array<{ db: string; host: string; port: number; serverId: number }>
    >`SELECT DATABASE() AS db, @@hostname AS host, @@port AS port, @@server_id AS serverId`;

    if (
      db[0]?.db !== "srikalahasti_availability_restore_test"
    ) {
      throw new Error("Wrong database target.");
    }

    const isolation = await prisma.$queryRaw<
      Array<{ isolation_level: string }>
    >`SELECT @@transaction_isolation AS isolation_level`;

    console.log(
      "Transaction isolation:",
      isolation[0]?.isolation_level
    );

    const products = await prisma.product.count();
    const orders = await prisma.order.count();

    const migrations = await prisma.$queryRaw<
      Array<{ total: bigint }>
    >`
      SELECT COUNT(*) AS total
      FROM _prisma_migrations
      WHERE finished_at IS NOT NULL
        AND rolled_back_at IS NULL
    `;

    const fields = await prisma.$queryRaw<
      Array<{ COLUMN_NAME: string }>
    >`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'Order'
        AND COLUMN_NAME IN (
          'inventoryStatus',
          'inventoryDeductedAt'
        )
    `;

    console.log("Database:", db[0].db);
    console.log("Server:", `${db[0].host}:${db[0].port} (server ${db[0].serverId})`);
    console.log("Products:", products);
    console.log("Orders:", orders);
    console.log("Migrations:", String(migrations[0].total));
    console.log(
      "Inventory fields:",
      fields.map(f => f.COLUMN_NAME)
    );

    if (
      Number(migrations[0].total) !== 14 ||
      fields.length !== 2
    ) {
      throw new Error("Test database is not ready.");
    }

    console.log("PASS: Isolated database verified.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(error => {
  console.error("FAIL:", error.message);
  process.exitCode = 1;
});
