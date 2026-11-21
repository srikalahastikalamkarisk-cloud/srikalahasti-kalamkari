import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import {
  deleteAllProducts,
  deleteCategoryTree,
  deleteProduct,
  deleteSelectedProducts,
} from "../src/lib/admin/catalog-deletion";

const TEST_DATABASE = "srikalahasti_availability_restore_test";
const source = process.env.DATABASE_URL;
if (!source) throw new Error("DATABASE_URL missing");
const isolatedUrl = new URL(source);
isolatedUrl.pathname = `/${TEST_DATABASE}`;
const prisma = new PrismaClient({ adapter: new PrismaMariaDb(isolatedUrl.toString()) });
class ExpectedRollback extends Error {}

async function main() {
  const initialDb = await prisma.$queryRaw<Array<{ db: string }>>`SELECT DATABASE() AS db`;
  assert.equal(initialDb[0]?.db, TEST_DATABASE, "Refusing catalog deletion tests outside isolated database");
  console.log(`PASS: write target is ${TEST_DATABASE}`);

  const suffix = randomUUID().replaceAll("-", "");
  let rolledBack = false;
  try {
    await prisma.$transaction(async tx => {
      const txDb = await tx.$queryRaw<Array<{ db: string }>>`SELECT DATABASE() AS db`;
      assert.equal(txDb[0]?.db, TEST_DATABASE, "Refusing transaction writes outside isolated database");

      const makeCategory = (name: string, parentId: string | null = null) =>
        tx.category.create({
          data: {
            name: `${name} ${suffix}`,
            slug: `${name.toLowerCase()}-${suffix}-${randomUUID().slice(0, 6)}`,
            parentId,
          },
        });
      const makeProduct = (name: string, categoryId: string) =>
        tx.product.create({
          data: {
            name: `${name} ${suffix}`,
            slug: `${name.toLowerCase()}-${suffix}-${randomUUID().slice(0, 6)}`,
            categoryId,
            price: "125.50",
            stock: 4,
            isActive: true,
            availabilityStatus: "IN_STOCK",
            pricingMode: "FIXED",
            sku: `SKU-${suffix.slice(0, 12)}-${randomUUID().slice(0, 6)}`,
            images: ["/images/catalog-delete-test.jpg"],
          },
        });

      const base = await makeCategory("delete-test-base");
      const withoutOrder = await makeProduct("without-order", base.id);
      await deleteProduct(tx, withoutOrder.id);
      assert.equal(await tx.product.count({ where: { id: withoutOrder.id } }), 0);
      console.log("PASS: product without orders can be permanently deleted");

      const withOrder = await makeProduct("with-order", base.id);
      const order = await tx.order.create({
        data: {
          orderNumber: `CATDEL-${suffix}-ORDER`,
          customerName: "Catalog Delete Test Customer",
          customerEmail: "catalog-delete@example.invalid",
          customerPhone: "0000000000",
          address: "Test address",
          city: "Test city",
          state: "Test state",
          pincode: "000000",
          subtotal: "251.00",
          totalAmount: "251.00",
          paymentStatus: "PAID",
          paymentId: `pay_${suffix.slice(0, 20)}`,
          items: {
            create: {
              productId: withOrder.id,
              productName: withOrder.name,
              productImage: "/images/catalog-delete-test.jpg",
              productSku: withOrder.sku,
              quantity: 2,
              unitPrice: "125.5",
              totalPrice: "251",
            },
          },
          paymentAttempts: {
            create: { amountPaise: 25100, currency: "INR", status: "CAPTURED" },
          },
        },
        include: { items: true, paymentAttempts: true },
      });
      const orderEventId = `catalog-delete-${suffix}`;
      await tx.paymentWebhookEvent.create({
        data: { eventId: orderEventId, eventType: "payment.captured", status: "PROCESSED" },
      });
      await deleteProduct(tx, withOrder.id);
      assert.equal(await tx.product.count({ where: { id: withOrder.id } }), 0);
      const preservedOrder = await tx.order.findUniqueOrThrow({
        where: { id: order.id },
        include: { items: true, paymentAttempts: true },
      });
      assert.equal(preservedOrder.paymentStatus, "PAID");
      assert.equal(preservedOrder.items.length, 1);
      assert.deepEqual(
        {
          name: preservedOrder.items[0].productName,
          image: preservedOrder.items[0].productImage,
          sku: preservedOrder.items[0].productSku,
          quantity: preservedOrder.items[0].quantity,
          unitPrice: preservedOrder.items[0].unitPrice.toFixed(2),
          totalPrice: preservedOrder.items[0].totalPrice.toFixed(2),
        },
        {
          name: withOrder.name,
          image: "/images/catalog-delete-test.jpg",
          sku: withOrder.sku,
          quantity: 2,
          unitPrice: "125.50",
          totalPrice: "251.00",
        }
      );
      assert.equal(preservedOrder.paymentAttempts.length, 1);
      assert.equal(await tx.paymentWebhookEvent.count({ where: { eventId: orderEventId } }), 1);
      console.log("PASS: ordered product deletion preserves order snapshot, customer data, payment attempt, and webhook event");

      const simpleCategory = await makeCategory("simple-category");
      const simpleProducts = await Promise.all([
        makeProduct("simple-a", simpleCategory.id),
        makeProduct("simple-b", simpleCategory.id),
        makeProduct("simple-c", simpleCategory.id),
      ]);
      const simpleDelete = await deleteCategoryTree(tx, {
        categoryId: simpleCategory.id,
        confirmName: simpleCategory.name,
        expectedCategoryCount: 1,
        expectedProductCount: 3,
      });
      assert.deepEqual(simpleDelete, { categoryCount: 1, productCount: 3 });
      assert.equal(await tx.category.count({ where: { id: simpleCategory.id } }), 0);
      assert.equal(await tx.product.count({ where: { id: { in: simpleProducts.map(product => product.id) } } }), 0);
      console.log("PASS: category with 3 products and 0 subcategories deletes exactly those records");

      const treeRoot = await makeCategory("nested-root");
      const treeChild = await makeCategory("nested-child", treeRoot.id);
      const treeGrandchild = await makeCategory("nested-grandchild", treeChild.id);
      const unrelated = await makeCategory("unrelated-category");
      const treeProducts = await Promise.all([
        makeProduct("nested-root-product", treeRoot.id),
        makeProduct("nested-child-product", treeChild.id),
        makeProduct("nested-grandchild-product", treeGrandchild.id),
      ]);
      const unrelatedProduct = await makeProduct("unrelated-product", unrelated.id);
      const nestedDelete = await deleteCategoryTree(tx, {
        categoryId: treeRoot.id,
        confirmName: treeRoot.name,
        expectedCategoryCount: 3,
        expectedProductCount: 3,
      });
      assert.deepEqual(nestedDelete, { categoryCount: 3, productCount: 3 });
      assert.equal(await tx.category.count({ where: { id: { in: [treeRoot.id, treeChild.id, treeGrandchild.id] } } }), 0);
      assert.equal(await tx.product.count({ where: { id: { in: treeProducts.map(product => product.id) } } }), 0);
      assert.equal(await tx.category.count({ where: { id: unrelated.id } }), 1);
      assert.equal(await tx.product.count({ where: { id: unrelatedProduct.id } }), 1);
      console.log("PASS: nested category tree deletes descendants and only its assigned products");

      const bulkCategory = await makeCategory("bulk-category");
      const bulkProducts = await Promise.all([
        makeProduct("bulk-a", bulkCategory.id),
        makeProduct("bulk-b", bulkCategory.id),
        makeProduct("bulk-keep", bulkCategory.id),
      ]);
      const selectedDeleted = await deleteSelectedProducts(tx, [bulkProducts[0].id, bulkProducts[1].id]);
      assert.equal(selectedDeleted, 2);
      assert.equal(await tx.product.count({ where: { id: { in: [bulkProducts[0].id, bulkProducts[1].id] } } }), 0);
      assert.equal(await tx.product.count({ where: { id: bulkProducts[2].id } }), 1);
      console.log("PASS: selected bulk deletion deletes only selected products");

      const allProductCount = await tx.product.count();
      const allDeleted = await deleteAllProducts(tx, allProductCount);
      assert.equal(allDeleted, allProductCount);
      assert.equal(await tx.product.count(), 0);
      assert.equal(await tx.order.count({ where: { id: order.id } }), 1);
      assert.equal(await tx.paymentAttempt.count({ where: { orderId: order.id } }), 1);
      assert.equal(await tx.paymentWebhookEvent.count({ where: { eventId: orderEventId } }), 1);
      console.log(`PASS: delete-all removes exactly ${allProductCount} isolated products and preserves order/payment data`);

      throw new ExpectedRollback("ROLLBACK_CATALOG_DELETE_TEST_FIXTURES");
    }, { maxWait: 10000, timeout: 30000 });
  } catch (error) {
    if (!(error instanceof ExpectedRollback)) throw error;
    rolledBack = true;
  } finally {
    await prisma.$disconnect();
  }

  assert.equal(rolledBack, true, "Test fixtures must be rolled back");
  console.log("PASS: all catalog deletion test writes rolled back");
}

main().catch(error => {
  console.error("Catalog deletion integration test failed:", error);
  process.exitCode = 1;
});
