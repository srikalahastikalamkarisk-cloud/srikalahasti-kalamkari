import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Module from "node:module";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

// This test deliberately has no DATABASE_URL fallback. Supply independent
// credentials for a pre-created, disposable, migrated MySQL test database.
const rawUrl = process.env.VARIANT_TEST_DATABASE_URL;
const expectedDatabase = process.env.VARIANT_TEST_DATABASE_NAME;
const expectedHost = process.env.VARIANT_TEST_DATABASE_HOST;
const expectedUser = process.env.VARIANT_TEST_DATABASE_USER;
const databaseName = "sk_variant_checkout_test";
if (!rawUrl || !expectedDatabase || !expectedHost || !expectedUser) {
  throw new Error(
    "Set VARIANT_TEST_DATABASE_URL, VARIANT_TEST_DATABASE_NAME, VARIANT_TEST_DATABASE_HOST, and VARIANT_TEST_DATABASE_USER to dedicated test credentials."
  );
}
if (expectedDatabase !== databaseName) {
  throw new Error(`Refusing test database name other than ${databaseName}.`);
}
const testUrl = new URL(rawUrl);
if (
  decodeURIComponent(testUrl.pathname.replace(/^\//, "")) !== databaseName ||
  testUrl.hostname !== expectedHost ||
  decodeURIComponent(testUrl.username) !== expectedUser ||
  testUrl.port !== "3306" ||
  !["127.0.0.1", "localhost", "::1"].includes(testUrl.hostname)
) {
  throw new Error("Test URL must match the local dedicated database identity on port 3306.");
}

process.env.DATABASE_URL = testUrl.toString();
const prisma = new PrismaClient({ adapter: new PrismaMariaDb(testUrl.toString()) });
const suffix = randomUUID().replaceAll("-", "");
const categoryId = `variant-test-${suffix}`;
const productIds: string[] = [];
const orderIds: string[] = [];

const loader = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = loader._load;
loader._load = function(request, parent, isMain) {
  if (request === "server-only") return {};
  return originalLoad(request, parent, isMain);
};

async function orderLock(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], id: string) {
  await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM \`Order\` WHERE id = ${id} FOR UPDATE`;
}

async function main() {
  const identity = await prisma.$queryRaw<Array<{ db: string; host: string; user: string; version: string; product: string }>>`
    SELECT DATABASE() AS db, @@hostname AS host,
      SUBSTRING_INDEX(CURRENT_USER(), '@', 1) AS user,
      @@version AS version, @@version_comment AS product
  `;
  assert.equal(identity[0]?.db, databaseName, "Refusing writes outside the dedicated test database");
  assert.ok(identity[0]?.host, "Connected MySQL server hostname is missing");
  assert.equal(identity[0]?.user, expectedUser, "MySQL user identity mismatch");
  assert.match(identity[0]?.version ?? "", /^9\.3\./, "Expected Oracle MySQL 9.3");
  assert.match(identity[0]?.product ?? "", /MySQL Community Server/i, "Expected Oracle MySQL Community Server");
  const grants = await prisma.$queryRaw<Array<{ grant: string }>>`SHOW GRANTS FOR CURRENT_USER()`;
  const grantIsScoped = (grant: string) =>
    /^GRANT USAGE ON \*\.\* TO /i.test(grant) ||
    /^GRANT .* ON `?sk_variant_checkout_test`?\.\* TO /i.test(grant);
  assert.ok(
    grants.length > 0 && grants.every(row => grantIsScoped(row.grant)),
    "Test credentials must have privileges limited to the dedicated test database."
  );

  const [{ deductOrderInventory }, { reconcilePaidInventory }] = await Promise.all([
    import("../src/lib/payments/deduct-order-inventory"),
    import("../src/lib/payments/reconcile-paid-inventory"),
  ]);
  const category = await prisma.category.create({
    data: { id: categoryId, name: `Variant Test ${suffix}`, slug: `variant-test-${suffix}` },
  });

  async function makeProduct(options: {
    slug: string;
    pricingMode: string;
    stock: number;
    variants?: { lengthMeters: number; stock: number }[];
  }) {
    const product = await prisma.product.create({
      data: {
        name: `Variant integration ${options.slug}`,
        slug: `${options.slug}-${suffix}`,
        categoryId: category.id,
        price: "100.00",
        pricingMode: options.pricingMode,
        stock: options.stock,
        availabilityStatus: options.stock ? "IN_STOCK" : "OUT_OF_STOCK",
        variants: options.variants?.length ? {
          create: options.variants.map((v, index) => ({
            lengthMeters: v.lengthMeters,
            price: "100.00",
            stock: v.stock,
            sku: `VT-${suffix.slice(0, 12)}-${options.slug}-${index}`,
          })),
        } : undefined,
      },
      include: { variants: true },
    });
    productIds.push(product.id);
    return product;
  }

  async function makePaidOrder(productId: string, quantity: number, variantId?: string) {
    const order = await prisma.order.create({
      data: {
        orderNumber: `VT-${suffix}-${orderIds.length}`,
        customerName: "Variant Test",
        customerEmail: "variant-test@example.invalid",
        customerPhone: "0000000000",
        address: "Isolated integration test",
        city: "Test",
        state: "Test",
        pincode: "000000",
        subtotal: "100.00",
        totalAmount: "100.00",
        orderStatus: "PROCESSING",
        paymentStatus: "PAID",
        paymentId: `vt-pay-${suffix}-${orderIds.length}`,
        paidAt: new Date(),
        inventoryStatus: "PENDING",
        items: {
          create: {
            productId,
            productName: "Variant test item",
            variantId,
            quantity,
            unitPrice: "100.00",
            totalPrice: "100.00",
          },
        },
      },
    });
    orderIds.push(order.id);
    return order;
  }

  try {
    // Variant deduction, parent stock synchronization, and payment retry idempotency.
    const sale = await makeProduct({ slug: "retry", pricingMode: "LENGTH_OPTIONS", stock: 2, variants: [{ lengthMeters: 2, stock: 2 }] });
    const saleOrder = await makePaidOrder(sale.id, 1, sale.variants[0].id);
    assert.equal(await reconcilePaidInventory(saleOrder.id), "DEDUCTED");
    assert.equal(await reconcilePaidInventory(saleOrder.id), "ALREADY_DEDUCTED");
    assert.equal((await prisma.productVariant.findUniqueOrThrow({ where: { id: sale.variants[0].id } })).stock, 1);
    const saleParent = await prisma.product.findUniqueOrThrow({ where: { id: sale.id } });
    assert.equal(saleParent.stock, 1);
    assert.equal(saleParent.availabilityStatus, "IN_STOCK");

    // Two distinct paid orders compete for the final unit.
    const scarce = await makeProduct({ slug: "concurrent", pricingMode: "LENGTH_OPTIONS", stock: 1, variants: [{ lengthMeters: 3, stock: 1 }] });
    const concurrentOrders = [
      await makePaidOrder(scarce.id, 1, scarce.variants[0].id),
      await makePaidOrder(scarce.id, 1, scarce.variants[0].id),
    ];
    const concurrentResults = await Promise.all(concurrentOrders.map(o => reconcilePaidInventory(o.id)));
    assert.equal(concurrentResults.filter(v => v === "DEDUCTED").length, 1);
    assert.equal(concurrentResults.filter(v => v === "REVIEW_REQUIRED").length, 1);
    const scarceParent = await prisma.product.findUniqueOrThrow({ where: { id: scarce.id } });
    assert.equal(scarceParent.stock, 0);
    assert.equal(scarceParent.availabilityStatus, "OUT_OF_STOCK");

    // Inject a failure after one variant update; the surrounding MySQL transaction must roll it back.
    const rollbackProduct = await makeProduct({ slug: "rollback", pricingMode: "LENGTH_OPTIONS", stock: 2, variants: [{ lengthMeters: 2, stock: 1 }, { lengthMeters: 4, stock: 1 }] });
    const rollbackOrder = await prisma.order.create({
      data: {
        orderNumber: `VT-${suffix}-rollback`, customerName: "Variant Test",
        customerEmail: "variant-test@example.invalid", customerPhone: "0000000000",
        address: "Isolated integration test", city: "Test", state: "Test", pincode: "000000",
        subtotal: "200.00", totalAmount: "200.00", orderStatus: "PROCESSING",
        paymentStatus: "PAID", paidAt: new Date(), inventoryStatus: "PENDING",
        items: { create: rollbackProduct.variants.map(v => ({
          productId: rollbackProduct.id, productName: "Rollback test item", variantId: v.id,
          quantity: 1, unitPrice: "100.00", totalPrice: "100.00",
        })) },
      },
    });
    orderIds.push(rollbackOrder.id);
    await assert.rejects(prisma.$transaction(async tx => {
      await orderLock(tx, rollbackOrder.id);
      const original = tx.productVariant.updateMany.bind(tx.productVariant);
      let calls = 0;
      const testTx = Object.create(tx);
      testTx.productVariant = Object.create(tx.productVariant);
      testTx.productVariant.updateMany = async (args: Parameters<typeof tx.productVariant.updateMany>[0]) => {
        calls++;
        if (calls === 2) return { count: 0 };
        return original(args);
      };
      await deductOrderInventory(testTx, rollbackOrder.id);
    }, { isolationLevel: "ReadCommitted" }));
    const rollbackRows = await prisma.productVariant.findMany({ where: { productId: rollbackProduct.id }, orderBy: { lengthMeters: "asc" } });
    assert.deepEqual(rollbackRows.map(v => v.stock), [1, 1]);
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: rollbackOrder.id } })).inventoryStatus, "PENDING");

    // Fixed-price products continue to deduct parent product stock.
    const fixed = await makeProduct({ slug: "fixed", pricingMode: "FIXED", stock: 1 });
    const fixedOrder = await makePaidOrder(fixed.id, 1);
    assert.equal(await reconcilePaidInventory(fixedOrder.id), "DEDUCTED");
    const fixedAfter = await prisma.product.findUniqueOrThrow({ where: { id: fixed.id } });
    assert.equal(fixedAfter.stock, 0);
    assert.equal(fixedAfter.availabilityStatus, "OUT_OF_STOCK");

    console.log("PASS: variant deduction, parent availability, paid retry idempotency, concurrency, rollback, and fixed-price inventory");
  } finally {
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.$disconnect();
    loader._load = originalLoad;
  }
}

main().catch(async error => {
  loader._load = originalLoad;
  await prisma.$disconnect();
  console.error(error);
  process.exitCode = 1;
});
