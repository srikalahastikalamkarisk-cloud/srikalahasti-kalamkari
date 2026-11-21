import "dotenv/config";
import assert from "node:assert/strict";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const TARGET_DATABASE = "srikalahasti_availability_restore_test";
const TARGET_MIGRATION = "20261117230000_inventory_movement_history";
const source = process.env.DATABASE_URL;

if (!source) throw new Error("DATABASE_URL is missing");

function urlFor(database: string) {
  const url = new URL(source!);
  url.pathname = `/${database}`;
  return url.toString();
}

function clientFor(database: string) {
  return new PrismaClient({ adapter: new PrismaMariaDb(urlFor(database)) });
}

async function main() {
  // Connect to INFORMATION_SCHEMA first so a missing target database can be
  // diagnosed without selecting or writing to the configured application DB.
  const metadataClient = clientFor("information_schema");
  let server: { hostname: string; port: number; maxConnections: number; threadsConnected: number };
  let targetExists = false;
  let movementTableExists = false;
  let migrationTableExists = false;
  let migrationApplied = false;
  let movementIndexes: string[] = [];
  let appliedMigrationCount = 0;
  let productCount = 0;
  let orderCount = 0;
  let inventoryMovementCount = 0;
  let fixtureProductCounts: Record<string, number> = {};
  let fixtureOrderCounts: Record<string, number> = {};
  let webhookProductEvidence: Array<Record<string, unknown>> = [];
  let testOrderEvidence: Array<Record<string, unknown>> = [];

  try {
    const rows = await metadataClient.$queryRaw<Array<{
      dbName: string;
      hostname: string;
      port: number;
      maxConnections: number;
    }>>`SELECT DATABASE() AS dbName, @@hostname AS hostname, @@port AS port, @@global.max_connections AS maxConnections`;
    const threadRows = await metadataClient.$queryRaw<Array<{ Variable_name: string; Value: string }>>`
      SHOW GLOBAL STATUS LIKE 'Threads_connected'
    `;

    server = {
      hostname: rows[0].hostname,
      port: rows[0].port,
      maxConnections: rows[0].maxConnections,
      threadsConnected: Number(threadRows[0]?.Value ?? 0),
    };

    const schemas = await metadataClient.$queryRaw<Array<{ schemaName: string }>>`
      SELECT SCHEMA_NAME AS schemaName
      FROM SCHEMATA
      WHERE SCHEMA_NAME = ${TARGET_DATABASE}
    `;
    targetExists = schemas.length === 1;

    if (targetExists) {
      const tables = await metadataClient.$queryRaw<Array<{ tableName: string }>>`
        SELECT TABLE_NAME AS tableName
        FROM TABLES
        WHERE TABLE_SCHEMA = ${TARGET_DATABASE}
          AND TABLE_NAME IN ('_prisma_migrations', 'InventoryMovement')
      `;
      movementTableExists = tables.some(row => row.tableName === "InventoryMovement");
      migrationTableExists = tables.some(row => row.tableName === "_prisma_migrations");

      if (movementTableExists) {
        const indexes = await metadataClient.$queryRaw<Array<{ indexName: string }>>`
          SELECT DISTINCT INDEX_NAME AS indexName
          FROM STATISTICS
          WHERE TABLE_SCHEMA = ${TARGET_DATABASE}
            AND TABLE_NAME = 'InventoryMovement'
          ORDER BY INDEX_NAME
        `;
        movementIndexes = indexes.map(row => row.indexName);
      }
    }
  } finally {
    await metadataClient.$disconnect();
  }

  console.log(`MySQL server: ${server!.hostname}:${server!.port}`);
  console.log(`Connection limits: max_connections=${server!.maxConnections}; threads_connected=${server!.threadsConnected}`);
  console.log(`Isolated database exists: ${targetExists}`);
  if (!targetExists) {
    console.log("Isolated database accepts connections: NO (database does not exist)");
    return;
  }
  console.log(`Migration history table exists: ${migrationTableExists}`);
  console.log(`InventoryMovement table exists: ${movementTableExists}`);
  console.log(`InventoryMovement indexes: ${movementIndexes.join(", ") || "none"}`);

  const targetClient = clientFor(TARGET_DATABASE);
  try {
    const selected = await targetClient.$queryRaw<Array<{ dbName: string }>>`SELECT DATABASE() AS dbName`;
    assert.equal(selected[0]?.dbName, TARGET_DATABASE, "Connected database did not match isolated target");
    console.log(`Isolated database accepts connections: YES (${selected[0].dbName})`);

    if (migrationTableExists) {
      const rows = await targetClient.$queryRaw<Array<{ total: bigint }>>`
        SELECT COUNT(*) AS total
        FROM _prisma_migrations
        WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
      `;
      appliedMigrationCount = Number(rows[0]?.total ?? 0);
      const target = await targetClient.$queryRaw<Array<{ migrationName: string; finishedAt: Date | null; rolledBackAt: Date | null }>>`
        SELECT migration_name AS migrationName, finished_at AS finishedAt, rolled_back_at AS rolledBackAt
        FROM _prisma_migrations
        WHERE migration_name = ${TARGET_MIGRATION}
      `;
      migrationApplied = target.some(row => row.finishedAt !== null && row.rolledBackAt === null);
    }

    [productCount, orderCount, inventoryMovementCount] = await Promise.all([
      targetClient.product.count(),
      targetClient.order.count(),
      targetClient.inventoryMovement.count(),
    ]);
    const productPrefixes = ["inventory-test-", "rollback-second-", "concurrency-", "webhook-test-", "webhook-rollback-"];
    const orderPrefixes = ["TEST-", "CONCURRENT-", "CATDEL-", "LEGACY-"];
    fixtureProductCounts = Object.fromEntries(await Promise.all(productPrefixes.map(async prefix => [
      prefix,
      await targetClient.product.count({ where: { slug: { startsWith: prefix } } }),
    ])));
    fixtureOrderCounts = Object.fromEntries(await Promise.all(orderPrefixes.map(async prefix => [
      prefix,
      await targetClient.order.count({ where: { orderNumber: { startsWith: prefix } } }),
    ])));

    const candidateProducts = await targetClient.product.findMany({
      where: { OR: [
        { slug: { startsWith: "webhook-test-" } },
        { slug: { startsWith: "webhook-rollback-" } },
      ] },
      select: { id: true, slug: true, name: true, sku: true },
      orderBy: { slug: "asc" },
    });
    webhookProductEvidence = candidateProducts.map(product => ({
      slug: product.slug,
      nameIsGeneratedWebhookFixture: product.name.startsWith("Webhook Test "),
      nameIsGeneratedRollbackFixture: product.name.startsWith("Webhook Rollback "),
      skuIsNull: product.sku === null,
    }));

    const candidateOrders = await targetClient.order.findMany({
      where: { orderNumber: { startsWith: "TEST-" } },
      select: {
        orderNumber: true,
        customerName: true,
        customerEmail: true,
        items: { select: { productId: true, productName: true } },
      },
      orderBy: { orderNumber: "asc" },
    });
    const productById = new Map(candidateProducts.map(product => [product.id, product]));
    testOrderEvidence = candidateOrders.map(order => {
      const suffix = order.orderNumber.slice("TEST-".length);
      return {
        orderNumber: order.orderNumber,
        customerNameIsGeneratedWebhookMarker: order.customerName === "Webhook Test",
        emailUsesInvalidExampleDomain: order.customerEmail.endsWith("@example.invalid"),
        itemCount: order.items.length,
        productsMatchGeneratedWebhookSlug: order.items.every(item =>
          productById.get(item.productId)?.slug === `webhook-test-${suffix}`
        ),
        itemNamesMatchProductSnapshots: order.items.every(item =>
          productById.get(item.productId)?.name === item.productName
        ),
      };
    });
  } finally {
    await targetClient.$disconnect();
  }

  console.log(`Applied migration count: ${appliedMigrationCount}`);
  console.log(`Target migration applied: ${migrationApplied}`);
  console.log(`Current isolated counts: products=${productCount}, orders=${orderCount}, inventoryMovements=${inventoryMovementCount}`);
  console.log("Known test-prefix product counts:", JSON.stringify(fixtureProductCounts));
  console.log("Known test-prefix order counts:", JSON.stringify(fixtureOrderCounts));
  console.log("Webhook product fixture evidence:", JSON.stringify(webhookProductEvidence));
  console.log("TEST order fixture evidence:", JSON.stringify(testOrderEvidence));
}

main().catch(error => {
  const code = error && typeof error === "object" && "code" in error
    ? String(error.code)
    : "UNKNOWN";
  const adapterCode = error && typeof error === "object" && "meta" in error
    ? String((error.meta as { driverAdapterError?: { cause?: { code?: string } } })?.driverAdapterError?.cause?.code ?? "UNKNOWN")
    : "UNKNOWN";
  console.error(`Read-only MySQL diagnostic failed: Prisma code=${code}; adapter cause=${adapterCode}`);
  process.exitCode = 1;
});
