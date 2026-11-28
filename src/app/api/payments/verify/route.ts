import { NextRequest, NextResponse } from "next/server";
import { paymentRequestGuard } from "@/lib/payments/request-guard";

import { prisma } from "@/lib/prisma";
import { reconcilePaidInventory } from "@/lib/payments/reconcile-paid-inventory";
import { getRazorpayClient } from "@/lib/payments/razorpay";
import { verifyPaymentSignature } from "@/lib/payments/signatures";
import { reconcileCouponRedemption } from "@/lib/checkout/reconcile-coupon-redemption";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const responseHeaders = {
  "Cache-Control": "no-store",
};

export async function POST(request: NextRequest) {
  const guardedRequest = await paymentRequestGuard(request);
  if (guardedRequest instanceof NextResponse) return guardedRequest;
  request = guardedRequest;

  try {
    const body: unknown = await request.json();

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid verification request." },
        { status: 400, headers: responseHeaders }
      );
    }

    const data = body as Record<string, unknown>;

    const internalOrderId = data.internalOrderId;
    const razorpayOrderId = data.razorpay_order_id;
    const razorpayPaymentId = data.razorpay_payment_id;
    const razorpaySignature = data.razorpay_signature;

    if (
      typeof internalOrderId !== "string" ||
      !internalOrderId ||
      typeof razorpayOrderId !== "string" ||
      !/^order_[A-Za-z0-9]+$/.test(razorpayOrderId) ||
      typeof razorpayPaymentId !== "string" ||
      !/^pay_[A-Za-z0-9]+$/.test(razorpayPaymentId) ||
      typeof razorpaySignature !== "string" ||
      !/^[a-f0-9]{64}$/i.test(razorpaySignature)
    ) {
      return NextResponse.json(
        { error: "Invalid payment verification details." },
        { status: 400, headers: responseHeaders }
      );
    }

    const validSignature = verifyPaymentSignature({
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    });

    if (!validSignature) {
      return NextResponse.json(
        { error: "Payment signature verification failed." },
        { status: 400, headers: responseHeaders }
      );
    }

    const order = await prisma.order.findUnique({
      where: { id: internalOrderId },
      include: {
        paymentAttempts: {
          where: { razorpayOrderId },
          take: 1,
        },
      },
    });

    if (!order || order.razorpayOrderId !== razorpayOrderId) {
      return NextResponse.json(
        { error: "Payment does not match the order." },
        { status: 409, headers: responseHeaders }
      );
    }

    const attempt = order.paymentAttempts[0];

    if (!attempt) {
      return NextResponse.json(
        { error: "Payment attempt not found." },
        { status: 409, headers: responseHeaders }
      );
    }

    const razorpay = getRazorpayClient();

    const payment = await razorpay.payments.fetch(
      razorpayPaymentId
    );

    if (
      payment.id !== razorpayPaymentId ||
      payment.order_id !== razorpayOrderId ||
      payment.amount !== attempt.amountPaise ||
      payment.currency !== attempt.currency ||
      payment.status !== "captured"
    ) {
      return NextResponse.json(
        {
          error: "Payment is not captured or payment details do not match.",
        },
        { status: 409, headers: responseHeaders }
      );
    }

    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM \`Order\`
        WHERE id = ${internalOrderId}
        FOR UPDATE
      `;

      const lockedOrder = await tx.order.findUnique({
        where: { id: internalOrderId },
      });

      const lockedAttempt = await tx.paymentAttempt.findUnique({
        where: { id: attempt.id },
      });

      if (!lockedOrder || !lockedAttempt) {
        return "MISSING" as const;
      }

      if (lockedOrder.orderStatus === "CANCELLED") {
        if (
          lockedAttempt.orderId !== lockedOrder.id ||
          lockedOrder.razorpayOrderId !== razorpayOrderId ||
          lockedAttempt.razorpayOrderId !== razorpayOrderId ||
          lockedOrder.currency !== "INR" ||
          lockedAttempt.currency !== "INR" ||
          payment.currency !== "INR" ||
          payment.captured !== true ||
          lockedAttempt.amountPaise !== payment.amount ||
          !lockedOrder.totalAmount.mul(100).equals(payment.amount) ||
          (lockedOrder.paymentId &&
            lockedOrder.paymentId !== razorpayPaymentId) ||
          (lockedAttempt.razorpayPaymentId &&
            lockedAttempt.razorpayPaymentId !== razorpayPaymentId)
        ) return "CONFLICT" as const;

        await tx.paymentAttempt.update({
          where: { id: lockedAttempt.id },
          data: {
            status: "CAPTURED",
            razorpayPaymentId,
          },
        });

        await tx.order.update({
          where: { id: lockedOrder.id },
          data: {
            paymentStatus: "PAID",
            paymentId: razorpayPaymentId,
            paidAt: lockedOrder.paidAt ?? new Date(),
            inventoryStatus: "REVIEW_REQUIRED",
          },
        });

        return "CANCELLED_PAID_REVIEW" as const;
      }

      if (lockedOrder.paymentStatus === "PAID") {
        return lockedOrder.paymentId === razorpayPaymentId
          ? "ALREADY_PAID" as const
          : "CONFLICT" as const;
      }

      if (
        lockedOrder.razorpayOrderId !== razorpayOrderId ||
        !lockedOrder.totalAmount.mul(100).isInteger() ||
        !lockedOrder.totalAmount.mul(100).equals(attempt.amountPaise) ||
        lockedAttempt.amountPaise !== attempt.amountPaise ||
        lockedAttempt.currency !== attempt.currency ||
        lockedAttempt.razorpayOrderId !== razorpayOrderId
      ) {
        return "CONFLICT" as const;
      }

      if (
        lockedAttempt.razorpayPaymentId &&
        lockedAttempt.razorpayPaymentId !== razorpayPaymentId
      ) {
        return "CONFLICT" as const;
      }

      await tx.paymentAttempt.update({
        where: { id: attempt.id },
        data: {
          razorpayPaymentId,
          status: "CAPTURED",
        },
      });

      await tx.order.update({
        where: { id: internalOrderId },
        data: {
          paymentId: razorpayPaymentId,
          paymentStatus: "PAID",
          paidAt: new Date(),
        },
      });

      return "PAID" as const;
    }, {
      isolationLevel: "ReadCommitted",
      maxWait: 10000,
      timeout: 20000,
    });

    if (
      result === "MISSING" ||
      result === "CONFLICT"
    ) {
      return NextResponse.json(
        { error: "Payment reconciliation requires review." },
        { status: 409, headers: responseHeaders }
      );
    }

    if (result === "CANCELLED_PAID_REVIEW") {
      return NextResponse.json(
        {
          success: false,
          status: "REVIEW_REQUIRED",
          retryAllowed: false,
          error: "Payment received for a cancelled order. Please contact support. Do not pay again.",
        },
        { status: 409, headers: responseHeaders }
      );
    }

    // The successful payment is committed above before coupon accounting.
    // Coupon reconciliation is idempotent and cannot reverse a captured payment.
    const couponStatus = await reconcileCouponRedemption(internalOrderId);

    // Payment status is committed before inventory reconciliation.
    // An inventory error must never reverse a captured payment.
    let inventoryStatus: string = "REVIEW_REQUIRED";

    try {
      inventoryStatus = await reconcilePaidInventory(internalOrderId);
    } catch (error) {
      console.error(
        "Paid order inventory reconciliation failed:",
        error instanceof Error ? error.name : "UnknownError"
      );
    }

    return NextResponse.json(
      {
        success: true,
        status: "PAID",
        alreadyProcessed: result === "ALREADY_PAID",
        couponStatus,
        inventoryStatus,
      },
      { status: 200, headers: responseHeaders }
    );
  } catch (error) {
    console.error(
      "Payment verification failed:",
      error instanceof Error ? error.name : "UnknownError"
    );

    return NextResponse.json(
      { error: "Unable to verify payment. Please contact support." },
      { status: 500, headers: responseHeaders }
    );
  }
}
