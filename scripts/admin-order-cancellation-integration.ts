import { NextRequest } from "next/server";
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
const TEST_DATABASE = "srikalahasti_availability_restore_test";
const LIVE_KEY_ID = "rzp_live_cancellation_test";
const LIVE_KEY_SECRET = "mock-only-secret";
const sourceUrl = process.env.DATABASE_URL;
if (!sourceUrl) throw new Error("DATABASE_URL missing");
const testUrl = new URL(sourceUrl);
if (!["localhost", "127.0.0.1", "::1"].includes(testUrl.hostname)) {
  throw new Error("STOP: cancellation integration test requires a local DB");
}
testUrl.pathname = `/${TEST_DATABASE}`;
process.env.DATABASE_URL = testUrl.toString();
process.env.RAZORPAY_MODE = "live";
process.env.RAZORPAY_KEY_ID = LIVE_KEY_ID;
process.env.RAZORPAY_KEY_SECRET = LIVE_KEY_SECRET;

const prisma = new PrismaClient({ adapter: new PrismaMariaDb(testUrl.toString()) });
const suffix = randomUUID().replaceAll("-", "");
const createdOrderIds: string[] = [];
const createdProductIds: string[] = [];
let routePrisma: typeof prisma | undefined;
let testAdmin: unknown = { id: "test-admin" };

async function loadRoute() {
  moduleLoader._load = function(request, parent, isMain) {
    if (request === "server-only") return {};
    if (request === "@/lib/admin-auth") {
      return { getCurrentAdmin: async () => testAdmin };
    }
    return originalLoad(request, parent, isMain);
  };
  try {
    const [route, prismaModule] = await Promise.all([
      import("../src/app/api/admin/orders/[id]/cancel/route"),
      import("../src/lib/prisma"),
    ]);
    routePrisma = prismaModule.prisma as typeof prisma;
    return { POST: route.POST };
  } finally {
    moduleLoader._load = originalLoad;
  }
}

async function main() {
  const db = await prisma.$queryRaw<Array<{ db: string; host: string }>>`
    SELECT DATABASE() AS db, @@hostname AS host
  `;
  assert.equal(db[0]?.db, TEST_DATABASE, "Refusing writes outside isolated DB");
  assert.ok(db[0]?.host, "MySQL server hostname missing");
  const category = await prisma.category.findFirst({ select: { id: true } });
  assert.ok(category, "Isolated test database must contain a category");
  const categoryId = category!.id;
  const { POST } = await loadRoute();
  const originalFetch = globalThis.fetch;
  let fetchMode: "empty" | "activity" | "error" = "empty";
  globalThis.fetch = async () => {
    if (fetchMode === "error") return new Response("unavailable", { status: 503 });
    return Response.json(fetchMode === "activity" ? { count: 1, items: [{ status: "failed" }] } : { count: 0, items: [] });
  };

  async function fixture(options: { paid?: boolean; paymentActivity?: boolean } = {}) {
    const tag = `${suffix}${createdOrderIds.length}`;
    const product = await prisma.product.create({ data: {
      name: `Cancel Route Test ${tag}`, slug: `cancel-route-test-${tag}`,
      categoryId, price: "100.00", stock: 5, isActive: true,
      availabilityStatus: "IN_STOCK", pricingMode: "FIXED",
    } });
    createdProductIds.push(product.id);
    const razorpayOrderId = `order_${tag}`;
    const paymentId = options.paid ? `pay_${tag}` : null;
    const order = await prisma.order.create({ data: {
      orderNumber: `TEST-CANCEL-ROUTE-${tag}`, customerName: "Cancellation Test",
      customerEmail: "cancel-route@example.invalid", customerPhone: "0000000000",
      address: "Test", city: "Test", state: "Test", pincode: "000000",
      subtotal: "100.00", totalAmount: "100.00",
      orderStatus: "PENDING", paymentStatus: options.paid ? "PAID" : "UNPAID",
      paymentId, paidAt: options.paid ? new Date() : null,
      razorpayOrderId, inventoryStatus: "PENDING",
      items: { create: { productId: product.id, productName: product.name,
        quantity: 1, unitPrice: "100.00", totalPrice: "100.00" } },
      paymentAttempts: { create: { razorpayOrderId,
        razorpayPaymentId: options.paymentActivity ? `pay_${tag}` : paymentId,
        status: options.paid ? "CAPTURED" : options.paymentActivity ? "FAILED" : "CREATED",
        amountPaise: 10000, currency: "INR" } },
    } });
    createdOrderIds.push(order.id);
    return order;
  }

  async function post(id: string, origin = "http://localhost") {
    const req = new NextRequest(`http://localhost/api/admin/orders/${id}/cancel`, {
      method: "POST", headers: { origin },
    });
    return POST(req as never, { params: Promise.resolve({ id }) });
  }

  try {
    const eligible = await fixture();
    const success = await post(eligible.id);
    assert.equal(success.status, 200, await success.text());
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: eligible.id } })).orderStatus, "CANCELLED");
    console.log("PASS: eligible unpaid order cancelled after empty mocked payment check");

    const paid = await fixture({ paid: true });
    assert.equal((await post(paid.id)).status, 409);
    console.log("PASS: paid order rejected");

    const activityOrder = await fixture();
    fetchMode = "activity";
    const activity = await post(activityOrder.id);
    assert.equal(activity.status, 409);
    assert.match((await activity.json()).error, /Manual review/);
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: activityOrder.id } })).orderStatus, "PENDING");
    console.log("PASS: Razorpay activity blocks cancellation for review");

    const verifyOrder = await fixture();
    fetchMode = "error";
    assert.equal((await post(verifyOrder.id)).status, 503);
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: verifyOrder.id } })).orderStatus, "PENDING");
    console.log("PASS: failed Razorpay verification blocks cancellation");

    testAdmin = null;
    assert.equal((await post(eligible.id)).status, 401);
    console.log("PASS: unauthorized request rejected");
    testAdmin = { id: "test-admin" };
    assert.equal((await post(eligible.id, "http://attacker.invalid")).status, 403);
    console.log("PASS: invalid origin rejected");
  } finally {
    globalThis.fetch = originalFetch;
    testAdmin = { id: "test-admin" };
    if (routePrisma && routePrisma !== prisma) await routePrisma.$disconnect();
    await prisma.paymentAttempt.deleteMany({ where: { orderId: { in: createdOrderIds } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: createdOrderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
    await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
    await prisma.$disconnect();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
