import "dotenv/config";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { NextRequest } from "next/server";
import Module from "node:module";

const moduleLoader = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};

const originalLoad = moduleLoader._load;
const providerOrderSnapshots = new Map<string, Record<string, unknown>>();
const providerPaymentsByOrder = new Map<string, Array<Record<string, unknown>>>();
let mockCustomer: { id: string; name: string; email: string; phone: string | null; emailVerifiedAt: Date | null } | null = null;
let providerOrderCreateCount = 0;

async function loadServerModules() {
  moduleLoader._load = function(request, parent, isMain) {
    if (request === "server-only") return {};
    if (request.includes("lib/payments/razorpay")) {
      return {
        getRazorpayClient: () => ({
          orders: {
            fetch: async (id: string) => providerOrderSnapshots.get(id),
            fetchPayments: async (id: string) => ({ items: providerPaymentsByOrder.get(id) ?? [] }),
            create: async (data: { amount: number; currency: string }) => {
              providerOrderCreateCount += 1;
              const id = `order_mock${providerOrderCreateCount}${randomUUID().replaceAll("-", "")}`;
              const snapshot = { id, amount: data.amount, amount_paid: 0, currency: data.currency, status: "created" };
              providerOrderSnapshots.set(id, snapshot);
              providerPaymentsByOrder.set(id, []);
              return snapshot;
            },
          },
        }),
        getRazorpayPublicKey: () => "rzp_live_mock_public_key",
      };
    }
    if (request.includes("lib/customer-auth")) return { getCurrentCustomer: async () => mockCustomer };
    return originalLoad(request, parent, isMain);
  };

  try {
    const [couponModule, webhookModule, prismaModule, createOrderModule, statusModule] = await Promise.all([
      import("../src/lib/checkout/reserve-coupon"),
      import("../src/app/api/payments/webhook/route"),
      import("../src/lib/prisma"),
      import("../src/app/api/payments/create-order/route"),
      import("../src/app/api/payments/status/route"),
    ]);

    return {
      reserveCoupon: couponModule.reserveCoupon,
      POST: webhookModule.POST,
      createOrder: createOrderModule.POST,
      paymentStatus: statusModule.POST,
      routePrisma: prismaModule.prisma,
    };
  } finally {
    // Keep the shim active for later dynamic imports in this test.
    // The test runs in its own Node.js process.
  }
}

const TEST_DATABASE = "srikalahasti_auth_step494_test";
const WEBHOOK_SECRET = "local-webhook-integration-secret";
const originalDatabaseUrl = process.env.DATABASE_URL;
if (!originalDatabaseUrl) throw new Error("DATABASE_URL missing");
const testUrl = new URL(originalDatabaseUrl);
testUrl.pathname = `/${TEST_DATABASE}`;
process.env.DATABASE_URL = testUrl.toString();
process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;

const prisma = new PrismaClient({ adapter: new PrismaMariaDb(testUrl.toString()) });

async function main() {
  // Fail closed if a test import unexpectedly bypasses the Razorpay API mock.
  process.env.RAZORPAY_MODE = "isolated-test-mock-only";
  const db = await prisma.$queryRaw<Array<{
    db: string;
    host: string;
    port: number;
    serverId: number;
  }>>`SELECT DATABASE() AS db, @@hostname AS host, @@port AS port, @@server_id AS serverId`;
  assert.equal(db[0]?.db, TEST_DATABASE, "Refusing to write outside isolated test database");
  console.log(`DATABASE: ${db[0].db} @ ${db[0].host}:${db[0].port} (server ${db[0].serverId})`);

  let category = await prisma.category.findFirst({ select: { id: true } });
  let createdCategoryId: string | null = null;
  if (!category) {
    category = await prisma.category.create({
      data: { name: "Payment Test Fixtures", slug: `payment-test-${randomUUID()}` },
      select: { id: true },
    });
    createdCategoryId = category.id;
  }
  const categoryId = category.id;
  const suffix = randomUUID().replaceAll("-", "");
  const createdProductIds: string[] = [];
  const createdOrderIds: string[] = [];
  const createdEventIds: string[] = [];
  const createdCouponIds: string[] = [];
  // Test the production route using its real database client and raw-body signature logic.
  const { reserveCoupon, POST, routePrisma, createOrder, paymentStatus } = await loadServerModules();
  const disconnectRoutePrisma = routePrisma.$disconnect.bind(routePrisma);

  async function fixture(options: {
    stock?: number;
    quantity?: number;
    inventoryStatus?: string;
    paymentStatus?: string;
    paymentId?: string | null;
  } = {}) {
    const tag = `${suffix}${createdOrderIds.length}`;
    const product = await prisma.product.create({
      data: {
        name: `Webhook Test ${tag}`,
        slug: `webhook-test-${tag}`,
        categoryId,
        price: "100.00",
        stock: options.stock ?? 5,
        isActive: true,
        availabilityStatus: "IN_STOCK",
        pricingMode: "FIXED",
        images: ["/images/test-item.jpg"],
      },
    });
    createdProductIds.push(product.id);
    const rzOrderId = `order_${tag}`;
    const paymentId = options.paymentId ?? null;
    const order = await prisma.order.create({
      data: {
        orderNumber: `TEST-${tag}`,
        customerName: "Webhook Test",
        customerEmail: "webhook-test@example.invalid",
        customerPhone: "0000000000",
        address: "Test Address",
        city: "Test City",
        state: "Test State",
        pincode: "000000",
        subtotal: "200.00",
        totalAmount: "200.00",
        paymentStatus: options.paymentStatus ?? "UNPAID",
        paymentId,
        razorpayOrderId: rzOrderId,
        inventoryStatus: options.inventoryStatus ?? "PENDING",
        items: {
          create: {
            productId: product.id,
            productName: product.name,
            productImage: "/images/test-item.jpg",
            quantity: options.quantity ?? 2,
            unitPrice: "100.00",
            totalPrice: "200.00",
          },
        },
        paymentAttempts: {
          create: {
            razorpayOrderId: rzOrderId,
            razorpayPaymentId: paymentId,
            status: paymentId ? "CAPTURED" : "CREATED",
            amountPaise: 20000,
            currency: "INR",
          },
        },
      },
    });
    createdOrderIds.push(order.id);
    return { product, order, rzOrderId };
  }

  function event(eventType: string, rzOrderId: string, paymentId: string, eventId: string, amountPaise = 20000) {
    const captured = eventType === "payment.captured";
    const body = JSON.stringify({
      event: eventType,
      payload: { payment: { entity: {
        id: paymentId,
        order_id: rzOrderId,
        amount: amountPaise,
        currency: "INR",
        status: captured ? "captured" : "failed",
        captured,
      } } },
    });
    const signature = createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
    createdEventIds.push(eventId);
    return new Request("http://localhost/api/payments/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-razorpay-event-id": eventId,
        "x-razorpay-signature": signature,
      },
      body,
    });
  }

  function paidOrderEvent(rzOrderId: string, eventId: string, amountPaise = 20000) {
    const body = JSON.stringify({ event: "order.paid", payload: { order: { entity: {
      id: rzOrderId, amount: amountPaise, amount_paid: amountPaise, currency: "INR", status: "paid",
    } } } });
    const signature = createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
    createdEventIds.push(eventId);
    return new Request("http://localhost/api/payments/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-razorpay-event-id": eventId, "x-razorpay-signature": signature },
      body,
    });
  }

  async function post(req: Request) {
    const response = await POST(req as never);
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  }

  function checkoutRequest(path: string, body: Record<string, unknown>) {
    return new NextRequest(`http://localhost${path}`, {
      method: "POST",
      headers: { origin: "http://localhost", "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function verify(f: Awaited<ReturnType<typeof fixture>>, expectedStatus: string, expectedStock: number) {
    const [order, product] = await Promise.all([
      prisma.order.findUniqueOrThrow({ where: { id: f.order.id } }),
      prisma.product.findUniqueOrThrow({ where: { id: f.product.id } }),
    ]);
    assert.equal(order.paymentStatus, expectedStatus);
    assert.equal(product.stock, expectedStock);
    return { order, product };
  }

  async function invokeRoute(route: (request: never) => Promise<Response>, path: string, body: Record<string, unknown>) {
    const response = await route(checkoutRequest(path, body) as never);
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  }

  try {
    const retryFixture = await fixture();
    const checkoutKey = randomUUID();
    const retryEmail = "retry-test@example.invalid";
    await prisma.order.update({
      where: { id: retryFixture.order.id },
      data: { checkoutKey, customerEmail: retryEmail },
    });
    mockCustomer = { id: "isolated-retry-customer", name: "Retry Test Customer", email: retryEmail, phone: "9876543210", emailVerifiedAt: new Date() };
    providerOrderSnapshots.set(retryFixture.rzOrderId, { id: retryFixture.rzOrderId, amount: 20000, amount_paid: 0, currency: "INR", status: "created" });
    providerPaymentsByOrder.set(retryFixture.rzOrderId, []);
    const retryBody = {
      checkoutKey,
      customer: { name: "Retry Test Customer", phone: "9876543210", email: retryEmail, address: "Isolated Test Delivery Address", landmark: "", city: "Test City", state: "Test State", pincode: "123456" },
      items: [{ productId: retryFixture.product.id, quantity: 2 }],
      couponCode: null,
    };
    const interruptedStatus = await invokeRoute(paymentStatus, "/api/payments/status", { checkoutKey });
    assert.equal(interruptedStatus.status, 200);
    assert.equal(interruptedStatus.body.status, "INTERRUPTED");
    assert.equal(interruptedStatus.body.retryAllowed, true);
    const providerOrderCountBeforeRetry = providerOrderCreateCount;
    const interruptedRetry = await invokeRoute(createOrder, "/api/payments/create-order", retryBody);
    assert.equal(interruptedRetry.status, 200);
    assert.equal(interruptedRetry.body.razorpayOrderId, retryFixture.rzOrderId);
    assert.equal(providerOrderCreateCount, providerOrderCountBeforeRetry);

    await prisma.paymentAttempt.updateMany({ where: { orderId: retryFixture.order.id }, data: { status: "FAILED" } });
    providerOrderSnapshots.set(retryFixture.rzOrderId, { id: retryFixture.rzOrderId, amount: 20000, amount_paid: 0, currency: "INR", status: "attempted" });
    providerPaymentsByOrder.set(retryFixture.rzOrderId, [{ status: "failed" }]);
    const failedStatus = await invokeRoute(paymentStatus, "/api/payments/status", { checkoutKey });
    assert.equal(failedStatus.body.status, "FAILED");
    assert.equal(failedStatus.body.retryAllowed, true);
    const failedRetry = await invokeRoute(createOrder, "/api/payments/create-order", retryBody);
    assert.equal(failedRetry.status, 200);
    assert.equal(failedRetry.body.razorpayOrderId, retryFixture.rzOrderId);
    assert.equal(providerOrderCreateCount, providerOrderCountBeforeRetry);

    providerPaymentsByOrder.set(retryFixture.rzOrderId, [{ status: "authorized" }]);
    const authorizedRetry = await invokeRoute(createOrder, "/api/payments/create-order", retryBody);
    assert.equal(authorizedRetry.status, 409);
    const unauthorizedOwner = { ...mockCustomer, id: "different-customer", email: "other-customer@example.invalid" };
    mockCustomer = unauthorizedOwner;
    const otherOwnerRetry = await invokeRoute(createOrder, "/api/payments/create-order", {
      ...retryBody,
      customer: { ...retryBody.customer, email: unauthorizedOwner.email },
    });
    assert.equal(otherOwnerRetry.status, 409);
    mockCustomer = { ...unauthorizedOwner, id: "isolated-retry-customer", email: retryEmail };

    providerOrderSnapshots.set(retryFixture.rzOrderId, { id: retryFixture.rzOrderId, amount: 20000, amount_paid: 20000, currency: "INR", status: "paid" });
    providerPaymentsByOrder.set(retryFixture.rzOrderId, [{ status: "captured" }]);
    const providerPaidRetry = await invokeRoute(createOrder, "/api/payments/create-order", retryBody);
    assert.equal(providerPaidRetry.status, 409);
    await prisma.order.update({ where: { id: retryFixture.order.id }, data: { paymentStatus: "PAID", paymentId: `pay_${suffix}paidretry` } });
    const localPaidRetry = await invokeRoute(createOrder, "/api/payments/create-order", retryBody);
    assert.equal(localPaidRetry.status, 409);
    mockCustomer = null;
    const guestRetry = await invokeRoute(createOrder, "/api/payments/create-order", retryBody);
    assert.equal(guestRetry.status, 401);
    console.log("PASS: isolated retry tests cover interrupted/failed retry, provider-order reuse, ownership, guest and already-paid rejection; Razorpay API mocked");

    // ADMIN-169: Late captured payment must not fulfil a cancelled order.
    const cancelled = await fixture();
    await prisma.order.update({
      where: { id: cancelled.order.id },
      data: { orderStatus: "CANCELLED" },
    });

    const cancelledEventId = `evt_cancel_${suffix}`;
    const cancelledResponse = await post(event(
      "payment.captured",
      cancelled.rzOrderId,
      `pay_${suffix}cancel`,
      cancelledEventId
    ));

    assert.equal(cancelledResponse.status, 200);

    const cancelledOrder = await prisma.order.findUniqueOrThrow({
      where: { id: cancelled.order.id },
    });
    const cancelledProduct = await prisma.product.findUniqueOrThrow({
      where: { id: cancelled.product.id },
    });
    const cancelledEvent = await prisma.paymentWebhookEvent.findUniqueOrThrow({
      where: { eventId: cancelledEventId },
    });

    assert.equal(cancelledOrder.orderStatus, "CANCELLED");
    assert.equal(cancelledOrder.paymentStatus, "UNPAID");
    assert.equal(cancelledOrder.inventoryStatus, "PENDING");
    assert.equal(cancelledProduct.stock, 5);
    assert.equal(cancelledEvent.status, "REVIEW");

    console.log("PASS: cancelled order late capture preserves stock");

    const captured = await fixture();
    const capturedEventId = `evt_${suffix}1`;
    const first = await post(event("payment.captured", captured.rzOrderId, `pay_${suffix}1`, capturedEventId));
    assert.equal(first.status, 200);
    await verify(captured, "PAID", 3);
    console.log("PASS: captured webhook records PAID and deducts stock once");

    const orderPaid = await fixture();
    providerOrderSnapshots.set(orderPaid.rzOrderId, { id: orderPaid.rzOrderId, amount: 20000, amount_paid: 20000, currency: "INR", status: "paid" });
    const orderPaidEventId = `evt_order_paid_${suffix}`;
    const orderPaidResponse = await post(paidOrderEvent(orderPaid.rzOrderId, orderPaidEventId));
    assert.equal(orderPaidResponse.status, 200);
    assert.equal(orderPaidResponse.body.result, "PAID");
    await verify(orderPaid, "PAID", 3);
    const orderPaidDuplicate = await post(paidOrderEvent(orderPaid.rzOrderId, orderPaidEventId));
    assert.equal(orderPaidDuplicate.status, 200);
    assert.equal(orderPaidDuplicate.body.duplicate, true);
    await verify(orderPaid, "PAID", 3);
    console.log("PASS: provider-verified order.paid and duplicate reconcile stock once");

    const authorized = await fixture();
    const authorizedEventId = `evt_authorized_${suffix}`;
    const authorizedResponse = await post(event("payment.authorized", authorized.rzOrderId, `pay_${suffix}auth`, authorizedEventId));
    assert.equal(authorizedResponse.status, 200);
    assert.equal(authorizedResponse.body.result, "IGNORED");
    assert.equal((await prisma.paymentWebhookEvent.findUniqueOrThrow({ where: { eventId: authorizedEventId } })).status, "IGNORED");
    await verify(authorized, "UNPAID", 5);
    const authorizationCapture = await post(event("payment.captured", authorized.rzOrderId, `pay_${suffix}auth`, `evt_auth_capture_${suffix}`));
    assert.equal(authorizationCapture.body.result, "PAID");
    await verify(authorized, "PAID", 3);
    console.log("PASS: payment.authorized is recorded but cannot mark paid; later capture reconciles");

    const refunded = await fixture({ paymentStatus: "PAID", paymentId: `pay_${suffix}refund` });
    const refundEventId = `evt_refund_${suffix}`;
    const refundResponse = await post(event("refund.processed", refunded.rzOrderId, `pay_${suffix}refund`, refundEventId));
    assert.equal(refundResponse.status, 200);
    assert.equal(refundResponse.body.result, "IGNORED");
    assert.equal((await prisma.paymentWebhookEvent.findUniqueOrThrow({ where: { eventId: refundEventId } })).status, "IGNORED");
    await verify(refunded, "PAID", 5);
    console.log("PASS: refund event is recorded as ignored; no refund action is enabled");

    const lateOrderPaid = await fixture();
    await post(event("payment.failed", lateOrderPaid.rzOrderId, `pay_${suffix}late`, `evt_failed_before_paid_${suffix}`));
    providerOrderSnapshots.set(lateOrderPaid.rzOrderId, { id: lateOrderPaid.rzOrderId, amount: 20000, amount_paid: 20000, currency: "INR", status: "paid" });
    const recoveredLateOrder = await post(paidOrderEvent(lateOrderPaid.rzOrderId, `evt_late_order_paid_${suffix}`));
    assert.equal(recoveredLateOrder.body.result, "PAID");
    await verify(lateOrderPaid, "PAID", 3);
    console.log("PASS: out-of-order failure then authoritative order.paid reconciles correctly");

    const mismatchedOrderPaid = await fixture();
    providerOrderSnapshots.set(mismatchedOrderPaid.rzOrderId, { id: mismatchedOrderPaid.rzOrderId, amount: 20000, amount_paid: 0, currency: "INR", status: "attempted" });
    const mismatchedOrderResponse = await post(paidOrderEvent(mismatchedOrderPaid.rzOrderId, `evt_bad_order_paid_${suffix}`));
    assert.equal(mismatchedOrderResponse.body.result, "REVIEW");
    await verify(mismatchedOrderPaid, "UNPAID", 5);
    const reviewEvent = await prisma.paymentWebhookEvent.findFirstOrThrow({ where: { eventType: "order.paid", status: "REVIEW", razorpayOrderId: mismatchedOrderPaid.rzOrderId } });
    assert.ok(reviewEvent);
    console.log("PASS: provider mismatch is persisted for Admin review without marking paid");

    const duplicate = await post(event("payment.captured", captured.rzOrderId, `pay_${suffix}1`, capturedEventId));
    assert.equal(duplicate.status, 200);
    assert.equal(duplicate.body.duplicate, true);
    await verify(captured, "PAID", 3);
    console.log("PASS: duplicate captured webhook does not deduct twice");

    const recovery = await fixture();
    const recoveryEventId = `evt_${suffix}2`;
    // A processed event with pending inventory models a committed payment whose earlier reconciliation was missed.
    const recoveryPaymentId = `pay_${suffix}2`;
    await prisma.order.update({ where: { id: recovery.order.id }, data: { paymentStatus: "PAID", paymentId: recoveryPaymentId } });
    await prisma.paymentAttempt.updateMany({ where: { orderId: recovery.order.id }, data: { status: "CAPTURED", razorpayPaymentId: recoveryPaymentId } });
    await prisma.paymentWebhookEvent.create({ data: { eventId: recoveryEventId, eventType: "payment.captured", status: "PROCESSED", processedAt: new Date() } });
    const recovered = await post(event("payment.captured", recovery.rzOrderId, recoveryPaymentId, recoveryEventId));
    assert.equal(recovered.status, 200);
    assert.equal(recovered.body.duplicate, true);
    await verify(recovery, "PAID", 3);
    console.log("PASS: duplicate webhook recovers missed inventory reconciliation");

    const lowStock = await fixture({ stock: 1 });
    const insufficient = await post(event("payment.captured", lowStock.rzOrderId, `pay_${suffix}3`, `evt_${suffix}3`));
    assert.equal(insufficient.status, 200);
    assert.equal(insufficient.body.inventoryStatus, "REVIEW_REQUIRED");
    await verify(lowStock, "PAID", 1);
    const lowStockOrder = await prisma.order.findUniqueOrThrow({ where: { id: lowStock.order.id } });
    assert.equal(lowStockOrder.inventoryStatus, "REVIEW_REQUIRED");
    console.log("PASS: insufficient stock preserves PAID and requires review");

    const legacy = await fixture({ inventoryStatus: "LEGACY_PAID", paymentStatus: "PAID", paymentId: `pay_${suffix}4` });
    const legacyAttempt = await post(event("payment.captured", legacy.rzOrderId, `pay_${suffix}4`, `evt_${suffix}4`));
    assert.equal(legacyAttempt.status, 200);
    await verify(legacy, "PAID", 5);
    console.log("PASS: LEGACY_PAID order stock is never deducted");

    const invalid = event("payment.captured", captured.rzOrderId, `pay_${suffix}1`, `evt_${suffix}5`);
    const invalidHeaders = new Headers(invalid.headers);
    invalidHeaders.set("x-razorpay-signature", "0".repeat(64));
    const rejected = await post(new Request(invalid, { headers: invalidHeaders }));
    assert.equal(rejected.status, 401);
    console.log("PASS: invalid webhook signature is rejected");

    const lateFailure = await post(event("payment.failed", captured.rzOrderId, `pay_${suffix}1`, `evt_${suffix}6`));
    assert.equal(lateFailure.status, 200);
    await verify(captured, "PAID", 3);
    console.log("PASS: failed payment event cannot downgrade PAID");

    const concurrent = await fixture();
    const concurrentEventId = `evt_${suffix}7`;
    const reqA = event("payment.captured", concurrent.rzOrderId, `pay_${suffix}7`, concurrentEventId);
    const reqB = event("payment.captured", concurrent.rzOrderId, `pay_${suffix}7`, concurrentEventId);
    const concurrentResults = await Promise.all([post(reqA), post(reqB)]);
    assert.ok(concurrentResults.every(result => result.status === 200));
    await verify(concurrent, "PAID", 3);
    console.log("PASS: concurrent duplicate callbacks deduct once");

    // Force a later product update in a multi-product deduction to fail. The transaction must restore earlier stock.
    const rollback = await fixture();
    const secondProduct = await prisma.product.create({
      data: {
        name: `Webhook Rollback ${suffix}`,
        slug: `webhook-rollback-${suffix}`,
        categoryId,
        price: "100.00",
        stock: 5,
        isActive: true,
        availabilityStatus: "IN_STOCK",
        pricingMode: "FIXED",
      },
    });
    createdProductIds.push(secondProduct.id);
    await prisma.orderItem.create({ data: {
      orderId: rollback.order.id,
      productId: secondProduct.id,
      productName: secondProduct.name,
      quantity: 1,
      unitPrice: "100.00",
      totalPrice: "100.00",
    } });
    let rollbackObserved = false;
    try {
      await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM \`Order\` WHERE id = ${rollback.order.id} FOR UPDATE`;
        const ids = [rollback.product.id, secondProduct.id].sort();
        for (const id of ids) await tx.$queryRaw`SELECT id FROM Product WHERE id = ${id} FOR UPDATE`;
        const first = ids[0];
        const second = ids[1];
        const firstUpdate = await tx.product.updateMany({ where: { id: first, stock: { gte: 1 } }, data: { stock: { decrement: 1 } } });
        assert.equal(firstUpdate.count, 1);
        const failedUpdate = await tx.product.updateMany({ where: { id: second, stock: { lt: 0 } }, data: { stock: { decrement: 1 } } });
        assert.equal(failedUpdate.count, 0);
        throw new Error("FORCED_INVENTORY_TRANSACTION_FAILURE");
      });
    } catch (error) {
      assert.match(String(error), /FORCED_INVENTORY_TRANSACTION_FAILURE/);
      rollbackObserved = true;
    }
    assert.equal(rollbackObserved, true);
    await verify(rollback, "UNPAID", 5);
    assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: secondProduct.id } })).stock, 5);
    console.log("PASS: forced transaction failure rolls back partial stock changes");

    const coupon = await prisma.coupon.create({
      data: {
        code: `HOOK${suffix.slice(0, 12).toUpperCase()}`,
        description: "Temporary webhook coupon integration fixture",
        discountType: "PERCENTAGE",
        discountValue: "10.00",
        minimumOrderAmount: "0.00",
        maximumDiscountAmount: "100.00",
        usageLimit: 1,
        usedCount: 0,
        isActive: true,
      },
    });
    createdCouponIds.push(coupon.id);
    const couponProduct = await prisma.product.create({
      data: {
        name: `Webhook Coupon ${suffix}`,
        slug: `webhook-coupon-${suffix}`,
        categoryId,
        price: "100.00",
        stock: 5,
        isActive: true,
        availabilityStatus: "IN_STOCK",
        pricingMode: "FIXED",
      },
    });
    createdProductIds.push(couponProduct.id);
    const couponOrderId = `order_coupon${suffix}`;
    const couponPaymentId = `pay_coupon${suffix}`;
    const couponOrder = await prisma.order.create({
      data: {
        orderNumber: `TEST-COUPON-${suffix}`,
        customerName: "Webhook Coupon Test",
        customerEmail: "coupon-test@example.invalid",
        customerPhone: "0000000000",
        address: "Isolated coupon integration fixture address",
        city: "Test City",
        state: "Test State",
        pincode: "000000",
        subtotal: "200.00",
        discountAmount: "20.00",
        couponCode: coupon.code,
        totalAmount: "180.00",
        paymentStatus: "UNPAID",
        razorpayOrderId: couponOrderId,
        items: { create: {
          productId: couponProduct.id,
          productName: couponProduct.name,
          productImage: "/images/test-item.jpg",
          quantity: 2,
          unitPrice: "100.00",
          totalPrice: "200.00",
        } },
        paymentAttempts: { create: {
          razorpayOrderId: couponOrderId,
          status: "CREATED",
          amountPaise: 18000,
          currency: "INR",
        } },
      },
    });
    createdOrderIds.push(couponOrder.id);
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM \`Order\` WHERE id = ${couponOrder.id} FOR UPDATE`;
      await reserveCoupon(tx, {
        couponId: coupon.id,
        couponCode: coupon.code,
        orderId: couponOrder.id,
        subtotalPaise: 20000,
        shippingPaise: 0,
        expectedDiscountPaise: 2000,
        expectedTotalPaise: 18000,
      });
    });

    const couponEventId = `evt_coupon_${suffix}`;
    const couponCapture = await post(event(
      "payment.captured",
      couponOrderId,
      couponPaymentId,
      couponEventId,
      18000
    ));
    assert.equal(couponCapture.status, 200);
    assert.equal(couponCapture.body.couponStatus, "REDEEMED");
    assert.equal((await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).usedCount, 1);
    assert.equal((await prisma.couponReservation.findUniqueOrThrow({ where: { orderId: couponOrder.id } })).status, "REDEEMED");
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: couponOrder.id } })).paymentStatus, "PAID");
    assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: couponProduct.id } })).stock, 3);

    const couponDuplicate = await post(event(
      "payment.captured",
      couponOrderId,
      couponPaymentId,
      couponEventId,
      18000
    ));
    assert.equal(couponDuplicate.status, 200);
    assert.equal(couponDuplicate.body.duplicate, true);
    assert.equal((await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).usedCount, 1);
    assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: couponProduct.id } })).stock, 3);
    console.log("PASS: captured webhook redeems a reserved coupon exactly once across duplicate delivery");

    console.log("PASS: all webhook integration scenarios completed against isolated database");
  } finally {
    const cleanupErrors: Error[] = [];

    try {
      // Re-verify the active connection immediately before any cleanup writes.
      const cleanupDb = await prisma.$queryRaw<Array<{
        db: string;
        host: string;
        port: number;
        serverId: number;
      }>>`SELECT DATABASE() AS db, @@hostname AS host, @@port AS port, @@server_id AS serverId`;
      assert.equal(
        cleanupDb[0]?.db,
        TEST_DATABASE,
        "Refusing cleanup outside isolated test database"
      );
      assert.equal(cleanupDb[0]?.host, db[0]?.host, "Database hostname changed during test");
      assert.equal(cleanupDb[0]?.port, db[0]?.port, "Database port changed during test");
      assert.equal(cleanupDb[0]?.serverId, db[0]?.serverId, "Database server changed during test");
      console.log(`CLEANUP DATABASE: ${cleanupDb[0].db} @ ${cleanupDb[0].host}:${cleanupDb[0].port} (server ${cleanupDb[0].serverId})`);

      const cleanupSteps: Array<[string, () => Promise<unknown>]> = [
        ["PaymentWebhookEvent", () => prisma.paymentWebhookEvent.deleteMany({
          where: { eventId: { in: createdEventIds } },
        })],
        ["CouponReservation", () => prisma.couponReservation.deleteMany({
          where: { orderId: { in: createdOrderIds } },
        })],
        ["InventoryMovement", () => prisma.inventoryMovement.deleteMany({
          where: {
            OR: [
              ...(createdProductIds.length ? [{ productId: { in: createdProductIds } }] : []),
              ...(createdOrderIds.length ? [{ referenceId: { in: createdOrderIds } }] : []),
            ],
          },
        })],
        ["PaymentAttempt", () => prisma.paymentAttempt.deleteMany({
          where: { orderId: { in: createdOrderIds } },
        })],
        ["OrderItem", () => prisma.orderItem.deleteMany({
          where: { orderId: { in: createdOrderIds } },
        })],
        ["Order", () => prisma.order.deleteMany({
          where: { id: { in: createdOrderIds } },
        })],
        ["Product", () => prisma.product.deleteMany({
          where: { id: { in: createdProductIds } },
        })],
        ["Coupon", () => prisma.coupon.deleteMany({
          where: { id: { in: createdCouponIds } },
        })],
        ...(createdCategoryId ? [["Category", () => prisma.category.deleteMany({ where: { id: createdCategoryId! } })] as [string, () => Promise<unknown>]] : []),
      ];

      for (const [recordType, cleanup] of cleanupSteps) {
        try {
          const result = await cleanup() as { count: number };
          console.log(`CLEANUP: ${recordType} deleted (${result.count})`);
        } catch (error) {
          const cleanupError = new Error(
            `Cleanup failed for ${recordType}: ${String(error)}`
          );
          cleanupErrors.push(cleanupError);
          console.error(cleanupError.message);
        }
      }

      const remaining = {
        PaymentWebhookEvent: createdEventIds.length
          ? await prisma.paymentWebhookEvent.count({ where: { eventId: { in: createdEventIds } } })
          : 0,
        CouponReservation: createdOrderIds.length
          ? await prisma.couponReservation.count({ where: { orderId: { in: createdOrderIds } } })
          : 0,
        InventoryMovement: (createdProductIds.length || createdOrderIds.length)
          ? await prisma.inventoryMovement.count({
            where: { OR: [
              ...(createdProductIds.length ? [{ productId: { in: createdProductIds } }] : []),
              ...(createdOrderIds.length ? [{ referenceId: { in: createdOrderIds } }] : []),
            ] },
          })
          : 0,
        PaymentAttempt: createdOrderIds.length
          ? await prisma.paymentAttempt.count({ where: { orderId: { in: createdOrderIds } } })
          : 0,
        OrderItem: createdOrderIds.length
          ? await prisma.orderItem.count({ where: { orderId: { in: createdOrderIds } } })
          : 0,
        Order: createdOrderIds.length
          ? await prisma.order.count({ where: { id: { in: createdOrderIds } } })
          : 0,
        Product: createdProductIds.length
          ? await prisma.product.count({ where: { id: { in: createdProductIds } } })
          : 0,
        Coupon: createdCouponIds.length
          ? await prisma.coupon.count({ where: { id: { in: createdCouponIds } } })
          : 0,
        Category: createdCategoryId ? await prisma.category.count({ where: { id: createdCategoryId } }) : 0,
      };
      console.log("CLEANUP REMAINING TRACKED RECORDS:", JSON.stringify(remaining));
      for (const [recordType, count] of Object.entries(remaining)) {
        if (count !== 0) {
          cleanupErrors.push(new Error(
            `Cleanup verification failed: ${count} tracked ${recordType} record(s) remain`
          ));
        }
      }
    } catch (error) {
      const cleanupError = new Error(
        `Cleanup or cleanup verification failed; cleanup may be partial: ${String(error)}`
      );
      cleanupErrors.push(cleanupError);
      console.error(cleanupError.message);
    } finally {
      try {
        await disconnectRoutePrisma?.();
      } catch (error) {
        const cleanupError = new Error(`Route Prisma disconnect failed: ${String(error)}`);
        cleanupErrors.push(cleanupError);
        console.error(cleanupError.message);
      }
      try {
        await prisma.$disconnect();
      } catch (error) {
        const cleanupError = new Error(`Prisma disconnect failed: ${String(error)}`);
        cleanupErrors.push(cleanupError);
        console.error(cleanupError.message);
      }
      process.env.DATABASE_URL = originalDatabaseUrl;
    }

    if (cleanupErrors.length) {
      throw new AggregateError(cleanupErrors, "Webhook integration test cleanup failed");
    }
  }
}

main().catch(error => {
  console.error("Webhook integration test failed:", error);
  process.exitCode = 1;
});
