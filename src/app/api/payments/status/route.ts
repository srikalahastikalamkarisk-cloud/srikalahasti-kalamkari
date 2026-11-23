import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { paymentRequestGuard } from "@/lib/payments/request-guard";
import { recoveryStatusFromOrder } from "@/lib/payments/recovery-status";
import { checkPaymentRecoveryRateLimit } from "@/lib/payments/rate-limit";
import { getCurrentCustomer } from "@/lib/customer-auth";
import { getRazorpayClient } from "@/lib/payments/razorpay";
import { canRetryRazorpayOrder } from "@/lib/payments/retry-eligibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "no-store",
};

export async function POST(request: NextRequest) {
  const guarded = await paymentRequestGuard(request);

  if (guarded instanceof NextResponse) {
    return guarded;
  }

  try {
    const customer = await getCurrentCustomer();
    if (!customer?.emailVerifiedAt) return NextResponse.json({ success: false, status: "REVIEW_REQUIRED", retryAllowed: false }, { status: 401, headers });
    const body = await guarded.json();

    if (
      !body ||
      typeof body.checkoutKey !== "string" ||
      !/^[A-Za-z0-9_-]{32,128}$/.test(body.checkoutKey)
    ) {
      return NextResponse.json(
        { error: "Invalid recovery request." },
        { status: 400, headers }
      );
    }

    const order = await prisma.order.findUnique({
      where: {
        checkoutKey: body.checkoutKey,
      },
      select: {
        customerEmail: true,
        orderNumber: true,
        paymentStatus: true,
        paymentAttempts: {
          select: {
            status: true,
            razorpayOrderId: true,
            amountPaise: true,
            currency: true,
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
        },
      },
    });

    if (!order) {
      return NextResponse.json(
        {
          success: false,
          status: "REVIEW_REQUIRED",
          retryAllowed: false,
        },
        { headers }
      );
    }

    if (order.customerEmail !== customer.email) return NextResponse.json({ success: false, status: "REVIEW_REQUIRED", retryAllowed: false }, { status: 404, headers });

    const allowed = await checkPaymentRecoveryRateLimit(
      body.checkoutKey
    );

    if (!allowed) {
      return NextResponse.json(
        {
          success: false,
          status: "REVIEW_REQUIRED",
          retryAllowed: false,
          error: "Payment status check temporarily unavailable.",
        },
        {
          status: 429,
          headers: {
            ...headers,
            "Retry-After": "60",
          },
        }
      );
    }

    const latestAttempt = order.paymentAttempts[0];
    let retryAllowed = false;
    let interrupted = false;
    if (
      order.paymentStatus !== "PAID" &&
      latestAttempt?.razorpayOrderId &&
      (latestAttempt.status === "FAILED" || latestAttempt.status === "CREATED")
    ) {
      try {
        const razorpay = getRazorpayClient();
        const [providerOrder, providerPayments] = await Promise.all([
          razorpay.orders.fetch(latestAttempt.razorpayOrderId),
          razorpay.orders.fetchPayments(latestAttempt.razorpayOrderId),
        ]);
        retryAllowed = canRetryRazorpayOrder({
          expectedOrderId: latestAttempt.razorpayOrderId,
          expectedAmountPaise: latestAttempt.amountPaise,
          order: providerOrder,
          payments: providerPayments.items,
        });
        interrupted = retryAllowed && latestAttempt.status === "CREATED";
      } catch {
        // Fail closed. A provider lookup failure must never authorize a retry.
      }
    }

    const result = recoveryStatusFromOrder(order, retryAllowed);
    return NextResponse.json(
      retryAllowed && interrupted
        ? { ...result, status: "INTERRUPTED", retryAllowed: true }
        : result,
      { headers }
    );
  } catch {
    return NextResponse.json(
      {
        success: false,
        status: "REVIEW_REQUIRED",
        retryAllowed: false,
      },
      { status: 503, headers }
    );
  }
}
