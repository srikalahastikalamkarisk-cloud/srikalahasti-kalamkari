import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { paymentRequestGuard } from "@/lib/payments/request-guard";

import { prisma } from "@/lib/prisma";
import { assertManagedMediaAvailable } from "@/lib/admin/global-media-references";
import { checkoutRequestSchema } from "@/lib/checkout/order-validation";
import {
  calculateCoupon,
  CouponValidationError,
} from "@/lib/checkout/calculate-coupon";
import {
  verifyCheckoutProducts,
  CheckoutValidationError,
} from "@/lib/checkout/verify-products";
import { getRazorpayClient, getRazorpayPublicKey } from "@/lib/payments/razorpay";
import { canRetryRazorpayOrder } from "@/lib/payments/retry-eligibility";
import {
  reserveCoupon,
  CouponReservationError,
} from "@/lib/checkout/reserve-coupon";
import { SHIPPING_AMOUNT_PAISE } from "@/lib/checkout/shipping-policy";
import { getCurrentCustomer } from "@/lib/customer-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function orderNumber() {
  return `SKK-${Date.now()}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

function money(paise: number) {
  return (paise / 100).toFixed(2);
}

export async function POST(request: NextRequest) {
  const guardedRequest = await paymentRequestGuard(request);
  if (guardedRequest instanceof NextResponse) return guardedRequest;
  request = guardedRequest;

  const customer = await getCurrentCustomer();
  if (!customer) return NextResponse.json({ error: "Sign in to continue to checkout.", loginRequired: true }, { status: 401 });
  if (!customer.emailVerifiedAt) return NextResponse.json({ error: "Verify your email to continue to checkout.", verificationRequired: true }, { status: 403 });

  let createdAttemptId: string | null = null;

  try {
    const body = await request.json();

    if (
      !body ||
      typeof body !== "object" ||
      typeof body.checkoutKey !== "string" ||
      !/^[a-zA-Z0-9_-]{16,128}$/.test(body.checkoutKey)
    ) {
      return NextResponse.json(
        { error: "A valid checkout key is required." },
        { status: 400 }
      );
    }

    const parsed = checkoutRequestSchema.safeParse({
      customer: body.customer,
      items: body.items,
      couponCode: body.couponCode,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid checkout details." },
        { status: 400 }
      );
    }
    if (parsed.data.customer.email.trim().toLowerCase() !== customer.email) return NextResponse.json({ error: "Checkout email must match your signed-in account." }, { status: 403 });
    parsed.data.customer.name = customer.name;

    // Never trust an amount supplied by the browser.
    const verified = await verifyCheckoutProducts(parsed.data.items);

    // Existing shipping policy: free shipping.
    const shippingPaise = SHIPPING_AMOUNT_PAISE;

    const existingCheckout = await prisma.order.findUnique({
      where: { checkoutKey: body.checkoutKey },
      select: { id: true },
    });

    const coupon = await calculateCoupon(
      parsed.data.couponCode,
      verified.subtotalPaise,
      shippingPaise,
      existingCheckout?.id
    );

    const totalPaise = coupon.totalPaise;

    if (!Number.isSafeInteger(totalPaise) || totalPaise <= 0) {
      return NextResponse.json(
        { error: "Invalid payment amount." },
        { status: 400 }
      );
    }

    // Validate LIVE credentials before creating database records.
    const razorpay = getRazorpayClient();

    let order = await prisma.order.findUnique({
      where: { checkoutKey: body.checkoutKey },
      include: {
        items: true,
        paymentAttempts: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (order) {
      if (order.orderStatus === "CANCELLED") {
        return NextResponse.json(
          { error: "This order has been cancelled. Please start a new checkout." },
          { status: 409 }
        );
      }

      if (order.paymentStatus === "PAID") {
        return NextResponse.json(
          { error: "This order has already been paid." },
          { status: 409 }
        );
      }

      const sameItems =
        order.items.length === verified.items.length &&
        verified.items.every(item =>
          order!.items.some(existing =>
            existing.productId === item.productId &&
            (existing.variantId ?? null) === (item.variantId ?? null) &&
            existing.quantity === item.quantity
          )
        );

      if (
        order.customerEmail !== parsed.data.customer.email ||
        Number(order.totalAmount) !== totalPaise / 100 ||
        order.couponCode !== coupon.couponCode ||
        Number(order.discountAmount) !== coupon.discountPaise / 100 ||
        !sameItems
      ) {
        return NextResponse.json(
          { error: "Checkout key was already used for different details." },
          { status: 409 }
        );
      }

    } else {
      try {
        order = await prisma.$transaction(async tx => {
          await assertManagedMediaAvailable(tx, verified.items.map(item => item.productImage));
          return tx.order.create({
          data: {
            orderNumber: orderNumber(),
            checkoutKey: body.checkoutKey,
            customerName: parsed.data.customer.name,
            customerEmail: parsed.data.customer.email,
            customerPhone: parsed.data.customer.phone,
            address: parsed.data.customer.address,
            landmark: parsed.data.customer.landmark || null,
            city: parsed.data.customer.city,
            state: parsed.data.customer.state,
            pincode: parsed.data.customer.pincode,
            subtotal: money(verified.subtotalPaise),
            shippingAmount: money(shippingPaise),
            discountAmount: money(coupon.discountPaise),
            couponCode: coupon.couponCode,
            totalAmount: money(totalPaise),
            currency: "INR",
            orderStatus: "PENDING",
            paymentStatus: "UNPAID",
            paymentMethod: "RAZORPAY",
            items: {
              create: verified.items.map(item => ({
                productId: item.productId,
                variantId: item.variantId,
                variantSnapshot: item.variantSnapshot ?? undefined,
                // Snapshot the selected option in the order item itself. ProductVariant
                // may later be edited or removed, so history must not depend on its FK.
                productName: item.variantLabel
                  ? `${item.productName} (${item.variantLabel})`
                  : item.productName,
                productImage: item.productImage,
                productSku: item.productSku,
                quantity: item.quantity,
                unitPrice: money(item.unitPricePaise),
                totalPrice: money(item.totalPricePaise),
              })),
            },
          },
          include: {
            items: true,
            paymentAttempts: {
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
          });
        });
      } catch (error) {
        // A concurrent request may have claimed this checkout key.
        const existing = await prisma.order.findUnique({
          where: { checkoutKey: body.checkoutKey },
        });

        if (existing) {
          return NextResponse.json(
            { error: "Checkout is already being processed. Please retry." },
            { status: 409 }
          );
        }

        throw error;
      }
    }

    if (!order) {
      return NextResponse.json(
        { error: "Unable to initialize checkout order." },
        { status: 500 }
      );
    }

    // Lock the order row and serialize payment-attempt creation.
    const attemptResult = await prisma.$transaction(async tx => {
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM \`Order\`
        WHERE id = ${order.id}
        FOR UPDATE
      `;

      // Re-read authoritative order state after acquiring the row lock.
      const lockedOrder = await tx.order.findUnique({
        where: { id: order.id },
        select: {
          id: true,
          orderStatus: true,
          paymentStatus: true,
          totalAmount: true,
        },
      });

      if (!lockedOrder) {
        return { kind: "missing" as const };
      }

      if (lockedOrder.orderStatus === "CANCELLED") {
        return { kind: "blocked" as const };
      }

      if (lockedOrder.paymentStatus === "PAID") {
        return { kind: "paid" as const };
      }

      if (Number(lockedOrder.totalAmount) !== totalPaise / 100) {
        return { kind: "amount_mismatch" as const };
      }

      if (coupon.couponId && coupon.couponCode) {
        await reserveCoupon(tx, {
          couponId: coupon.couponId,
          couponCode: coupon.couponCode,
          orderId: order.id,
          subtotalPaise: verified.subtotalPaise,
          shippingPaise,
          expectedDiscountPaise: coupon.discountPaise,
          expectedTotalPaise: coupon.totalPaise,
        });
      }

      const existingAttempt = await tx.paymentAttempt.findFirst({
        where: { orderId: order.id },
        orderBy: { createdAt: "desc" },
      });

      if (existingAttempt) {
        if (existingAttempt.razorpayOrderId) {
          return {
            kind: "existing" as const,
            attempt: existingAttempt,
          };
        }

        // Never blindly retry an attempt whose external result is unknown.
        return { kind: "blocked" as const };
      }

      const attempt = await tx.paymentAttempt.create({
        data: {
          orderId: order.id,
          amountPaise: totalPaise,
          currency: "INR",
          status: "CREATING",
        },
      });

      return {
        kind: "created" as const,
        attempt,
      };
    }, {
      maxWait: 5000,
      timeout: 10000,
    });

    if (
      attemptResult.kind === "paid" ||
      attemptResult.kind === "missing" ||
      attemptResult.kind === "amount_mismatch"
    ) {
      const message =
        attemptResult.kind === "paid"
          ? "This order has already been paid."
          : attemptResult.kind === "missing"
            ? "Checkout order no longer exists."
            : "Order amount changed. Please restart checkout.";

      return NextResponse.json(
        { error: message },
        { status: attemptResult.kind === "paid" ? 409 : 400 }
      );
    }

    if (attemptResult.kind === "blocked") {
      return NextResponse.json(
        {
          error: "A previous payment attempt needs reconciliation. No new payment was created.",
        },
        { status: 409 }
      );
    }

    if (attemptResult.kind === "existing") {
      const existingAttempt = attemptResult.attempt;
      if (!existingAttempt.razorpayOrderId) {
        return NextResponse.json({ error: "Payment needs reconciliation before it can be retried." }, { status: 409 });
      }
      const [providerOrder, providerPayments] = await Promise.all([
        razorpay.orders.fetch(existingAttempt.razorpayOrderId),
        razorpay.orders.fetchPayments(existingAttempt.razorpayOrderId),
      ]);
      const retrySafe = canRetryRazorpayOrder({
        expectedOrderId: existingAttempt.razorpayOrderId,
        expectedAmountPaise: existingAttempt.amountPaise,
        order: providerOrder,
        payments: providerPayments.items,
      });
      if (!retrySafe) {
        return NextResponse.json(
          { error: "Payment status is still being confirmed. Check its status before trying again." },
          { status: 409, headers: { "Cache-Control": "no-store" } }
        );
      }
      return NextResponse.json(
        {
          success: true,
          orderId: order.id,
          orderNumber: order.orderNumber,
          razorpayOrderId: existingAttempt.razorpayOrderId,
          amount: existingAttempt.amountPaise,
          currency: "INR",
          keyId: getRazorpayPublicKey(),
        },
        {
          status: 200,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    const attempt = attemptResult.attempt;
    createdAttemptId = attempt.id;

    const razorpayOrder = await razorpay.orders.create({
      amount: totalPaise,
      currency: "INR",
      receipt: order.orderNumber,
      notes: {
        internalOrderId: order.id,
        orderNumber: order.orderNumber,
        environment: "LIVE",
      },
    });

    await prisma.$transaction([
      prisma.paymentAttempt.update({
        where: { id: attempt.id },
        data: {
          razorpayOrderId: razorpayOrder.id,
          status: "CREATED",
        },
      }),
      prisma.order.update({
        where: { id: order.id },
        data: {
          razorpayOrderId: razorpayOrder.id,
        },
      }),
    ]);

    return NextResponse.json(
      {
        success: true,
        orderId: order.id,
        orderNumber: order.orderNumber,
        razorpayOrderId: razorpayOrder.id,
        amount: totalPaise,
        currency: "INR",
        keyId: getRazorpayPublicKey(),
      },
      {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    if (createdAttemptId) {
      try {
        await prisma.paymentAttempt.update({
          where: { id: createdAttemptId },
          data: { status: "CREATE_FAILED" },
        });
      } catch {
        console.error("Unable to update failed payment attempt.");
      }
    }

    if (error instanceof CouponValidationError) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    if (error instanceof CouponReservationError) {
      return NextResponse.json(
        { error: error.message },
        { status: 409 }
      );
    }

    if (error instanceof CheckoutValidationError) {
      return NextResponse.json(
        { error: error.message },
        { status: 409 }
      );
    }

    console.error(
      "Payment order creation failed:",
      error instanceof Error ? error.name : "UnknownError"
    );

    return NextResponse.json(
      { error: "Unable to create payment order." },
      { status: 500 }
    );
  }
}
