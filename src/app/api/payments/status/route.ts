import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { paymentRequestGuard } from "@/lib/payments/request-guard";
import { recoveryStatusFromOrder } from "@/lib/payments/recovery-status";
import { checkPaymentRecoveryRateLimit } from "@/lib/payments/rate-limit";

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
        orderNumber: true,
        paymentStatus: true,
        paymentAttempts: {
          select: {
            status: true,
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

    return NextResponse.json(
      recoveryStatusFromOrder(order),
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
