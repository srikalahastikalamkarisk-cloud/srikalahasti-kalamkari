import "dotenv/config";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import Module from "node:module";
import { NextRequest } from "next/server";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import type {
  CouponPaymentReader,
} from "../src/lib/checkout/coupon-reservation-reconciliation";

const DATABASE = "srikalahasti_availability_restore_test";
const WEBHOOK_SECRET = "coupon-reconciliation-isolated-secret";
const originalUrl = process.env.DATABASE_URL;
if (!originalUrl) throw new Error("DATABASE_URL missing");
const isolatedUrl = new URL(originalUrl);
isolatedUrl.pathname = `/${DATABASE}`;
process.env.DATABASE_URL = isolatedUrl.toString();
process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;

const prisma = new PrismaClient({ adapter: new PrismaMariaDb(isolatedUrl.toString()) });
const suffix = randomUUID().replaceAll("-", "");
const productIds: string[] = [];
const orderIds: string[] = [];
const couponIds: string[] = [];
const eventIds: string[] = [];
let routePrismaDisconnect: (() => Promise<void>) | undefined;

function mockProvider(order: {
  id: string;
  status: string;
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  attempts: number;
}, payments: Array<{
  id: string;
  order_id: string;
  status: string;
  captured: boolean;
  amount: number;
  currency: string;
}> = [], terminal = false): CouponPaymentReader {
  return {
    fetchOrder: async () => order,
    fetchPayments: async () => payments,
    isDefinitivelyTerminal: () => terminal,
  };
}

async function fixture(label: string, limit: number | null = 1) {
  const category = await prisma.category.findFirst({ select: { id: true } });
  assert.ok(category, "Isolated database requires an existing category");
  const coupon = await prisma.coupon.create({
    data: {
      code: `RC${suffix.slice(0, 10).toUpperCase()}${label.slice(0, 2).toUpperCase()}`,
      discountType: "PERCENTAGE",
      discountValue: "10.00",
      minimumOrderAmount: "0.00",
      maximumDiscountAmount: "20.00",
      usageLimit: limit,
      usedCount: 0,
      isActive: true,
    },
  });
  couponIds.push(coupon.id);
  const product = await prisma.product.create({
    data: {
      name: `Coupon Reconcile ${label} ${suffix}`,
      slug: `coupon-reconcile-${label.toLowerCase()}-${suffix}`,
      categoryId: category.id,
      price: "100.00",
      stock: 3,
      availabilityStatus: "IN_STOCK",
      isActive: true,
      pricingMode: "FIXED",
    },
  });
  productIds.push(product.id);
  const razorpayOrderId = `order_${suffix}${label}`;
  const razorpayPaymentId = `pay_${suffix}${label}`;
  const order = await prisma.order.create({
    data: {
      orderNumber: `TEST-COUPON-RECON-${suffix}-${label}`,
      customerName: "Coupon Reconciliation Fixture",
      customerEmail: "reconcile@example.invalid",
      customerPhone: "0000000000",
      address: "Isolated fixture address only",
      city: "Test City",
      state: "Test State",
      pincode: "123456",
      subtotal: "100.00",
      discountAmount: "10.00",
      couponCode: coupon.code,
      totalAmount: "90.00",
      paymentStatus: "UNPAID",
      razorpayOrderId,
      items: { create: {
        productId: product.id,
        productName: product.name,
        productImage: "/images/test-item.jpg",
        quantity: 1,
        unitPrice: "100.00",
        totalPrice: "100.00",
      } },
      paymentAttempts: { create: {
        razorpayOrderId,
        status: "CREATED",
        amountPaise: 9000,
        currency: "INR",
      } },
    },
  });
  orderIds.push(order.id);
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM \`Order\` WHERE id = ${order.id} FOR UPDATE`;
    const { reserveCoupon } = await import("../src/lib/checkout/reserve-coupon");
    await reserveCoupon(tx, {
      couponId: coupon.id,
      couponCode: coupon.code,
      orderId: order.id,
      subtotalPaise: 10000,
      shippingPaise: 0,
      expectedDiscountPaise: 1000,
      expectedTotalPaise: 9000,
    });
  });
  return { coupon, product, order, razorpayOrderId, razorpayPaymentId };
}

function providerOrder(id: string, status: string, attempts: number, amountPaid = 0) {
  return {
    id,
    status,
    amount: 9000,
    amount_paid: amountPaid,
    amount_due: 9000 - amountPaid,
    currency: "INR",
    attempts,
  };
}

async function webhook(orderId: string, paymentId: string, eventId: string) {
  const body = JSON.stringify({
    event: "payment.captured",
    payload: { payment: { entity: {
      id: paymentId,
      order_id: (await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).razorpayOrderId,
      amount: 9000,
      currency: "INR",
      status: "captured",
      captured: true,
    } } },
  });
  const signature = createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
  eventIds.push(eventId);
  const { POST } = await import("../src/app/api/payments/webhook/route");
  const response = await POST(new Request("http://localhost/api/payments/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-razorpay-event-id": eventId,
      "x-razorpay-signature": signature,
    },
    body,
  }) as never);
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

async function verifyWithMockedRazorpay(orderId: string, paymentId: string, eventId: string) {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  const body = JSON.stringify({
    internalOrderId: orderId,
    razorpay_order_id: order.razorpayOrderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: createHmac("sha256", WEBHOOK_SECRET)
      .update(`${order.razorpayOrderId}|${paymentId}`)
      .digest("hex"),
  });
  const moduleLoader = Module as unknown as {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown;
  };
  const originalLoad = moduleLoader._load;
  moduleLoader._load = function(request, parent, isMain) {
    if (request.endsWith("resources/payments")) {
      return () => ({
        fetch: async (requestedPaymentId: string) => {
          assert.equal(requestedPaymentId, paymentId);
          return {
            id: paymentId,
            order_id: order.razorpayOrderId,
            amount: 9000,
            currency: "INR",
            status: "captured",
          };
        },
      });
    }
    return originalLoad(request, parent, isMain);
  };

  const oldMode = process.env.RAZORPAY_MODE;
  const oldKeyId = process.env.RAZORPAY_KEY_ID;
  const oldKeySecret = process.env.RAZORPAY_KEY_SECRET;
  process.env.RAZORPAY_MODE = "live";
  process.env.RAZORPAY_KEY_ID = "rzp_live_coupon_reconciliation_mock";
  process.env.RAZORPAY_KEY_SECRET = WEBHOOK_SECRET;
  try {
    const { POST } = await import("../src/app/api/payments/verify/route");
    const response = await POST(new NextRequest("http://localhost/api/payments/verify", {
      method: "POST",
      headers: {
        origin: "http://localhost",
        "content-type": "application/json",
        "x-coupon-test-event": eventId,
      },
      body,
    }));
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  } finally {
    moduleLoader._load = originalLoad;
    if (oldMode === undefined) delete process.env.RAZORPAY_MODE;
    else process.env.RAZORPAY_MODE = oldMode;
    if (oldKeyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = oldKeyId;
    if (oldKeySecret === undefined) delete process.env.RAZORPAY_KEY_SECRET;
    else process.env.RAZORPAY_KEY_SECRET = oldKeySecret;
  }
}

async function main() {
  const databaseIdentity = await prisma.$queryRaw<Array<{ db: string; host: string; port: number; serverId: number }>>`
    SELECT DATABASE() AS db, @@hostname AS host, @@port AS port, @@server_id AS serverId
  `;
  assert.equal(databaseIdentity[0]?.db, DATABASE, "Refusing test writes outside isolated DB");
  console.log(`DATABASE ${databaseIdentity[0].db} @ ${databaseIdentity[0].host}:${databaseIdentity[0].port} server=${databaseIdentity[0].serverId}`);

  try {
    process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
    const { reconcileCouponReservation } = await import("../src/lib/checkout/coupon-reservation-reconciliation");
    const { prisma: routePrisma } = await import("../src/lib/prisma");
    routePrismaDisconnect = routePrisma.$disconnect.bind(routePrisma);

    const pending = await fixture("PENDING");
    const failedPayment = {
      id: `pay_failed_${suffix}`,
      order_id: pending.razorpayOrderId,
      status: "failed",
      captured: false,
      amount: 9000,
      currency: "INR",
    };
    const pendingGateway = mockProvider(providerOrder(pending.razorpayOrderId, "attempted", 1), [failedPayment]);
    const pendingResult = await reconcileCouponReservation({
      orderId: pending.order.id,
      provider: pendingGateway,
      dryRun: false,
      now: new Date(Date.now() + 31 * 60_000),
    });
    assert.equal(pendingResult.status, "NEEDS_REVIEW");
    assert.equal((await prisma.couponReservation.findUniqueOrThrow({ where: { orderId: pending.order.id } })).status, "REVIEW_REQUIRED");
    assert.equal(await prisma.coupon.count({ where: { id: pending.coupon.id, usedCount: 0 } }), 1);
    console.log("PASS expired failed attempt is retained for review; usage slot remains held");

    const competingOrderId = `order_${suffix}COMPETE`;
    const competingOrder = await prisma.order.create({
      data: {
        orderNumber: `TEST-COUPON-RECON-${suffix}-COMPETE`,
        customerName: "Coupon Reconciliation Fixture",
        customerEmail: "reconcile@example.invalid",
        customerPhone: "0000000000",
        address: "Isolated fixture address only",
        city: "Test City",
        state: "Test State",
        pincode: "123456",
        subtotal: "100.00",
        discountAmount: "10.00",
        couponCode: pending.coupon.code,
        totalAmount: "90.00",
        paymentStatus: "UNPAID",
        razorpayOrderId: competingOrderId,
        paymentAttempts: { create: { razorpayOrderId: competingOrderId, status: "CREATED", amountPaise: 9000, currency: "INR" } },
      },
    });
    orderIds.push(competingOrder.id);
    const { reserveCoupon } = await import("../src/lib/checkout/reserve-coupon");
    await assert.rejects(prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM \`Order\` WHERE id = ${competingOrder.id} FOR UPDATE`;
      return reserveCoupon(tx, {
        couponId: pending.coupon.id,
        couponCode: pending.coupon.code,
        orderId: competingOrder.id,
        subtotalPaise: 10000,
        shippingPaise: 0,
        expectedDiscountPaise: 1000,
        expectedTotalPaise: 9000,
      });
    }), /usage limit/);
    console.log("PASS review-required reservations continue to protect the usage limit");

    const unlimited = await fixture("UNLIMITED", null);
    const { calculateCoupon } = await import("../src/lib/checkout/calculate-coupon");
    const unlimitedPreview = await calculateCoupon(unlimited.coupon.code, 10000, 0);
    assert.equal(unlimitedPreview.discountPaise, 1000);
    const unlimitedSecondId = `order_${suffix}UNLIMITED2`;
    const unlimitedSecond = await prisma.order.create({
      data: {
        orderNumber: `TEST-COUPON-RECON-${suffix}-UNLIMITED2`,
        customerName: "Coupon Reconciliation Fixture",
        customerEmail: "reconcile@example.invalid",
        customerPhone: "0000000000",
        address: "Isolated fixture address only",
        city: "Test City",
        state: "Test State",
        pincode: "123456",
        subtotal: "100.00",
        discountAmount: "10.00",
        couponCode: unlimited.coupon.code,
        totalAmount: "90.00",
        paymentStatus: "UNPAID",
        razorpayOrderId: unlimitedSecondId,
        paymentAttempts: { create: { razorpayOrderId: unlimitedSecondId, status: "CREATED", amountPaise: 9000, currency: "INR" } },
      },
    });
    orderIds.push(unlimitedSecond.id);
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM \`Order\` WHERE id = ${unlimitedSecond.id} FOR UPDATE`;
      await reserveCoupon(tx, {
        couponId: unlimited.coupon.id,
        couponCode: unlimited.coupon.code,
        orderId: unlimitedSecond.id,
        subtotalPaise: 10000,
        shippingPaise: 0,
        expectedDiscountPaise: 1000,
        expectedTotalPaise: 9000,
      });
    });
    assert.equal(await prisma.couponReservation.count({
      where: { couponId: unlimited.coupon.id, status: "RESERVED" },
    }), 2);
    console.log("PASS held reservations do not block unlimited-use coupon checkout");

    const scarceCoupon = await prisma.coupon.create({
      data: {
        code: `RC${suffix.slice(0, 10).toUpperCase()}SC`,
        discountType: "PERCENTAGE",
        discountValue: "10.00",
        minimumOrderAmount: "0.00",
        maximumDiscountAmount: "20.00",
        usageLimit: 1,
        usedCount: 0,
        isActive: true,
      },
    });
    couponIds.push(scarceCoupon.id);
    const scarceOrders = await Promise.all(["A", "B"].map(async suffixTag => {
      const razorpayOrderId = `order_${suffix}${suffixTag}SCARCE`;
      const order = await prisma.order.create({
        data: {
          orderNumber: `TEST-COUPON-RECON-${suffix}-SCARCE-${suffixTag}`,
          customerName: "Coupon Reconciliation Fixture",
          customerEmail: "reconcile@example.invalid",
          customerPhone: "0000000000",
          address: "Isolated fixture address only",
          city: "Test City",
          state: "Test State",
          pincode: "123456",
          subtotal: "100.00",
          discountAmount: "10.00",
          couponCode: scarceCoupon.code,
          totalAmount: "90.00",
          paymentStatus: "UNPAID",
          razorpayOrderId,
          paymentAttempts: { create: { razorpayOrderId, status: "CREATED", amountPaise: 9000, currency: "INR" } },
        },
      });
      orderIds.push(order.id);
      return order;
    }));
    const concurrentReservations = await Promise.allSettled(scarceOrders.map(order =>
      prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM \`Order\` WHERE id = ${order.id} FOR UPDATE`;
        return reserveCoupon(tx, {
          couponId: scarceCoupon.id,
          couponCode: scarceCoupon.code,
          orderId: order.id,
          subtotalPaise: 10000,
          shippingPaise: 0,
          expectedDiscountPaise: 1000,
          expectedTotalPaise: 9000,
        });
      })
    ));
    assert.equal(concurrentReservations.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(concurrentReservations.filter(result => result.status === "rejected").length, 1);
    const rejectedReservation = concurrentReservations.find(result => result.status === "rejected");
    assert.ok(rejectedReservation && rejectedReservation.status === "rejected");
    assert.match(String(rejectedReservation.reason), /usage limit/i);
    assert.equal(await prisma.couponReservation.count({
      where: { couponId: scarceCoupon.id, status: { in: ["RESERVED", "REVIEW_REQUIRED"] } },
    }), 1);
    console.log("PASS concurrent limited-use claims reserve exactly one available use");

    const abandoned = await fixture("ABANDONED");
    const dryRun = await reconcileCouponReservation({
      orderId: abandoned.order.id,
      provider: mockProvider(providerOrder(abandoned.razorpayOrderId, "created", 0)),
      dryRun: true,
      now: new Date(Date.now() + 31 * 60_000),
    });
    assert.equal(dryRun.status, "NEEDS_REVIEW");
    assert.equal((await prisma.couponReservation.findUniqueOrThrow({ where: { orderId: abandoned.order.id } })).status, "RESERVED");
    console.log("PASS dry-run does not release abandoned order with still-open provider state");

    const terminal = await fixture("TERMINAL");
    const terminalResult = await reconcileCouponReservation({
      orderId: terminal.order.id,
      provider: mockProvider(providerOrder(terminal.razorpayOrderId, "attempted", 1), [], true),
      dryRun: false,
      now: new Date(Date.now() + 31 * 60_000),
    });
    assert.equal(terminalResult.status, "RELEASED");
    assert.equal((await prisma.couponReservation.findUniqueOrThrow({ where: { orderId: terminal.order.id } })).status, "RELEASED");
    assert.equal(await prisma.coupon.count({ where: { id: terminal.coupon.id, usedCount: 0 } }), 1);
    const replacementId = `order_${suffix}REPLACEMENT`;
    const replacement = await prisma.order.create({
      data: {
        orderNumber: `TEST-COUPON-RECON-${suffix}-REPLACEMENT`,
        customerName: "Coupon Reconciliation Fixture",
        customerEmail: "reconcile@example.invalid",
        customerPhone: "0000000000",
        address: "Isolated fixture address only",
        city: "Test City",
        state: "Test State",
        pincode: "123456",
        subtotal: "100.00",
        discountAmount: "10.00",
        couponCode: terminal.coupon.code,
        totalAmount: "90.00",
        paymentStatus: "UNPAID",
        razorpayOrderId: replacementId,
        paymentAttempts: { create: { razorpayOrderId: replacementId, status: "CREATED", amountPaise: 9000, currency: "INR" } },
      },
    });
    orderIds.push(replacement.id);
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM \`Order\` WHERE id = ${replacement.id} FOR UPDATE`;
      await reserveCoupon(tx, {
        couponId: terminal.coupon.id,
        couponCode: terminal.coupon.code,
        orderId: replacement.id,
        subtotalPaise: 10000,
        shippingPaise: 0,
        expectedDiscountPaise: 1000,
        expectedTotalPaise: 9000,
      });
    });
    assert.equal((await prisma.couponReservation.findUniqueOrThrow({ where: { orderId: replacement.id } })).status, "RESERVED");
    console.log("PASS mocked explicit terminal provider state releases without consuming usage");

    const captured = await fixture("CAPTURED");
    const capturedPayment = {
      id: captured.razorpayPaymentId,
      order_id: captured.razorpayOrderId,
      status: "captured",
      captured: true,
      amount: 9000,
      currency: "INR",
    };
    const capturedGateway = mockProvider(providerOrder(captured.razorpayOrderId, "paid", 1, 9000), [capturedPayment]);
    const capturedDryRun = await reconcileCouponReservation({
      orderId: captured.order.id,
      provider: capturedGateway,
      dryRun: true,
    });
    assert.equal(capturedDryRun.action, "WOULD_REDEEM");
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: captured.order.id } })).paymentStatus, "UNPAID");
    assert.equal((await prisma.paymentAttempt.findFirstOrThrow({ where: { orderId: captured.order.id } })).status, "CREATED");
    assert.equal((await prisma.couponReservation.findUniqueOrThrow({ where: { orderId: captured.order.id } })).status, "RESERVED");
    assert.equal((await prisma.coupon.findUniqueOrThrow({ where: { id: captured.coupon.id } })).usedCount, 0);
    assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: captured.product.id } })).stock, 3);
    assert.equal(await prisma.inventoryMovement.count({ where: { referenceId: captured.order.id } }), 0);
    console.log("PASS captured-payment dry-run leaves payment, coupon, and inventory state unchanged");
    const eventId = `evt_reconcile_${suffix}`;
    const results = await Promise.all([
      reconcileCouponReservation({ orderId: captured.order.id, provider: capturedGateway, dryRun: false }),
      webhook(captured.order.id, captured.razorpayPaymentId, eventId),
    ]);
    assert.equal((results[1] as { status: number }).status, 200);
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: captured.order.id } })).paymentStatus, "PAID");
    assert.equal((await prisma.coupon.findUniqueOrThrow({ where: { id: captured.coupon.id } })).usedCount, 1);
    assert.equal((await prisma.couponReservation.findUniqueOrThrow({ where: { orderId: captured.order.id } })).status, "REDEEMED");
    assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: captured.product.id } })).stock, 2);
    assert.equal(await prisma.inventoryMovement.count({ where: { referenceId: captured.order.id } }), 1);
    const duplicate = await webhook(captured.order.id, captured.razorpayPaymentId, eventId);
    assert.equal(duplicate.status, 200);
    assert.equal((await prisma.coupon.findUniqueOrThrow({ where: { id: captured.coupon.id } })).usedCount, 1);
    assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: captured.product.id } })).stock, 2);
    assert.equal(await prisma.inventoryMovement.count({ where: { referenceId: captured.order.id } }), 1);
    console.log("PASS captured payment/provider-webhook race redeems and deducts inventory exactly once");

    const verifyRace = await fixture("VERIFYRACE");
    const verifyRaceEventId = `evt_verify_race_${suffix}`;
    const verifyRaceResults = await Promise.all([
      verifyWithMockedRazorpay(verifyRace.order.id, verifyRace.razorpayPaymentId, verifyRaceEventId),
      webhook(verifyRace.order.id, verifyRace.razorpayPaymentId, verifyRaceEventId),
    ]);
    assert.equal((verifyRaceResults[0] as { status: number }).status, 200);
    assert.equal((verifyRaceResults[1] as { status: number }).status, 200);
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: verifyRace.order.id } })).paymentStatus, "PAID");
    assert.equal((await prisma.coupon.findUniqueOrThrow({ where: { id: verifyRace.coupon.id } })).usedCount, 1);
    assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: verifyRace.product.id } })).stock, 2);
    assert.equal(await prisma.inventoryMovement.count({ where: { referenceId: verifyRace.order.id } }), 1);
    console.log("PASS mocked payment verification/webhook race redeems and deducts inventory exactly once");

    const concurrent = await fixture("CONCURRENT");
    const concurrentGateway = mockProvider(providerOrder(concurrent.razorpayOrderId, "created", 0), [], true);
    const concurrentResults = await Promise.all(Array.from({ length: 4 }, () =>
      reconcileCouponReservation({
        orderId: concurrent.order.id,
        provider: concurrentGateway,
        dryRun: false,
        now: new Date(Date.now() + 31 * 60_000),
      })
    ));
    assert.ok(concurrentResults.every(result => result.status === "RELEASED"));
    assert.equal((await prisma.couponReservation.findUniqueOrThrow({ where: { orderId: concurrent.order.id } })).status, "RELEASED");
    assert.equal((await prisma.coupon.findUniqueOrThrow({ where: { id: concurrent.coupon.id } })).usedCount, 0);
    console.log("PASS concurrent reconciliation workers release one reservation once");
  } finally {
    const cleanupIdentity = await prisma.$queryRaw<Array<{ db: string; host: string; port: number; serverId: number }>>`
      SELECT DATABASE() AS db, @@hostname AS host, @@port AS port, @@server_id AS serverId
    `;
    assert.equal(cleanupIdentity[0]?.db, DATABASE, "Refusing cleanup outside isolated DB");
    const errors: Error[] = [];
    const cleanupSteps: Array<[string, () => Promise<{ count: number }>]> = [
      ["PaymentWebhookEvent", () => prisma.paymentWebhookEvent.deleteMany({ where: { eventId: { in: eventIds } } })],
      ["InventoryMovement", () => prisma.inventoryMovement.deleteMany({ where: { OR: [
        ...(productIds.length ? [{ productId: { in: productIds } }] : []),
        ...(orderIds.length ? [{ referenceId: { in: orderIds } }] : []),
      ] } })],
      ["PaymentAttempt", () => prisma.paymentAttempt.deleteMany({ where: { orderId: { in: orderIds } } })],
      ["OrderItem", () => prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } })],
      ["CouponReservation", () => prisma.couponReservation.deleteMany({ where: { orderId: { in: orderIds } } })],
      ["Order", () => prisma.order.deleteMany({ where: { id: { in: orderIds } } })],
      ["Product", () => prisma.product.deleteMany({ where: { id: { in: productIds } } })],
      ["Coupon", () => prisma.coupon.deleteMany({ where: { id: { in: couponIds } } })],
    ];
    for (const [table, cleanup] of cleanupSteps) {
      try { console.log(`CLEANUP ${table}: ${(await cleanup()).count}`); }
      catch (error) { errors.push(new Error(`${table}: ${String(error)}`)); }
    }
    const remaining = {
      events: await prisma.paymentWebhookEvent.count({ where: { eventId: { in: eventIds } } }),
      movements: await prisma.inventoryMovement.count({ where: { OR: [
        ...(productIds.length ? [{ productId: { in: productIds } }] : []),
        ...(orderIds.length ? [{ referenceId: { in: orderIds } }] : []),
      ] } }),
      attempts: await prisma.paymentAttempt.count({ where: { orderId: { in: orderIds } } }),
      items: await prisma.orderItem.count({ where: { orderId: { in: orderIds } } }),
      reservations: await prisma.couponReservation.count({ where: { orderId: { in: orderIds } } }),
      orders: await prisma.order.count({ where: { id: { in: orderIds } } }),
      products: await prisma.product.count({ where: { id: { in: productIds } } }),
      coupons: await prisma.coupon.count({ where: { id: { in: couponIds } } }),
    };
    console.log("CLEANUP REMAINING:", JSON.stringify(remaining));
    if (Object.values(remaining).some(count => count !== 0)) errors.push(new Error("Tracked test rows remain after cleanup"));
    try { await routePrismaDisconnect?.(); } catch (error) { errors.push(new Error(`Route Prisma disconnect: ${String(error)}`)); }
    try { await prisma.$disconnect(); } catch (error) { errors.push(new Error(`Prisma disconnect: ${String(error)}`)); }
    process.env.DATABASE_URL = originalUrl;
    if (errors.length) throw new AggregateError(errors, "Coupon reconciliation test cleanup failed");
  }
}

main().catch(error => { console.error("Coupon reservation reconciliation integration failed:", error); process.exitCode = 1; });
