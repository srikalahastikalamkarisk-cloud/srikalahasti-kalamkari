import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { reconcilePaidInventory } from "@/lib/payments/reconcile-paid-inventory";
import { reconcileCouponRedemption } from "@/lib/checkout/reconcile-coupon-redemption";
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
    if (!customer || (!customer.emailVerifiedAt && !customer.mobileVerifiedAt)) return NextResponse.json({ success: false, status: "REVIEW_REQUIRED", retryAllowed: false }, { status: 401, headers });
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
        id: true,
        customerEmail: true,
        customerId: true,
        orderNumber: true,
        paymentStatus: true,
        orderStatus: true,
        items: {
          select: {
            productId: true,
            variantId: true,
            quantity: true,
          },
        },
        paymentAttempts: {
          select: {
            id: true,
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

    console.info("[PAYMENT-RECOVERY]", {
      orderFound: Boolean(order),
      paymentStatus: order?.paymentStatus ?? null,
      orderStatus: order?.orderStatus ?? null,
      attempts: order?.paymentAttempts.length ?? 0,
      ownershipMatches: order
        ? order.customerId === customer.id || (!order.customerId && Boolean(customer.emailVerifiedAt && customer.email && order.customerEmail === customer.email))
        : null
    });

    if (!order) {
      return NextResponse.json(
        {
          success: true,
          status: "ORDER_NOT_FOUND",
          retryAllowed: false,
        },
        { headers }
      );
    }

    const ownsOrder = order.customerId === customer.id || (!order.customerId && Boolean(customer.emailVerifiedAt && customer.email && order.customerEmail === customer.email));
    if (!ownsOrder) return NextResponse.json({ success: false, status: "REVIEW_REQUIRED", retryAllowed: false }, { status: 404, headers });

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
    let recoveredPaid = false;
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
        const captured = providerPayments.items.filter(payment =>
          payment.status === "captured" &&
          payment.captured === true &&
          payment.order_id === latestAttempt.razorpayOrderId &&
          payment.amount === latestAttempt.amountPaise &&
          payment.currency === "INR" &&
          /^pay_[A-Za-z0-9]+$/.test(payment.id)
        );

        if (
          captured.length === 1 &&
          providerOrder.id === latestAttempt.razorpayOrderId &&
          providerOrder.status === "paid" &&
          providerOrder.currency === "INR" &&
          providerOrder.amount === latestAttempt.amountPaise &&
          providerOrder.amount_paid === latestAttempt.amountPaise
        ) {
          const payment = captured[0];

          recoveredPaid = await prisma.$transaction(async tx => {
            await tx.$queryRaw<Array<{ id: string }>>`
              SELECT id FROM \`Order\`
              WHERE id = ${order.id}
              FOR UPDATE
            `;

            const lockedOrder = await tx.order.findUnique({
              where: { id: order.id }
            });

            const lockedAttempt = await tx.paymentAttempt.findUnique({
              where: { id: latestAttempt.id }
            });

            if (
              !lockedOrder ||
              !lockedAttempt ||
              !(lockedOrder.customerId === customer.id || (!lockedOrder.customerId && Boolean(customer.emailVerifiedAt && customer.email && lockedOrder.customerEmail === customer.email))) ||
              lockedAttempt.orderId !== lockedOrder.id ||
              lockedOrder.razorpayOrderId !== payment.order_id ||
              lockedAttempt.razorpayOrderId !== payment.order_id ||
              lockedAttempt.amountPaise !== payment.amount ||
              lockedAttempt.currency !== "INR" ||
              lockedOrder.currency !== "INR" ||
              !lockedOrder.totalAmount.mul(100).equals(payment.amount) ||
              (lockedOrder.paymentId &&
                lockedOrder.paymentId !== payment.id) ||
              (lockedAttempt.razorpayPaymentId &&
                lockedAttempt.razorpayPaymentId !== payment.id)
            ) return false;

            await tx.paymentAttempt.update({
              where: { id: lockedAttempt.id },
              data: {
                status: "CAPTURED",
                razorpayPaymentId: payment.id
              }
            });

            await tx.order.update({
              where: { id: lockedOrder.id },
              data: {
                paymentStatus: "PAID",
                paymentId: payment.id,
                paidAt: lockedOrder.paidAt ?? new Date(),
                ...(lockedOrder.orderStatus === "CANCELLED"
                  ? { inventoryStatus: "REVIEW_REQUIRED" }
                  : {})
              }
            });

            return true;
          }, {
            isolationLevel: "ReadCommitted",
            maxWait: 10000,
            timeout: 20000
          });

          const recoveredOrder = recoveredPaid
            ? await prisma.order.findUnique({
                where: { id: order.id },
                select: { orderStatus: true },
              })
            : null;

          if (
            recoveredPaid &&
            recoveredOrder &&
            recoveredOrder.orderStatus !== "CANCELLED"
          ) {
            try {
              await reconcileCouponRedemption(order.id);
            } catch {
              console.error("Recovery coupon reconciliation requires review");
            }

            try {
              await reconcilePaidInventory(order.id);
            } catch {
              console.error("Recovery inventory reconciliation requires review");
            }
          }
        }

        retryAllowed = !recoveredPaid && canRetryRazorpayOrder({
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

    const currentOrder = await prisma.order.findUnique({
      where: { id: order.id },
      select: {
        customerEmail: true,
        customerId: true,
        orderStatus: true,
        paymentStatus: true,
        orderNumber: true,
        paymentAttempts: {
          select: { id: true, status: true, razorpayOrderId: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!currentOrder || !(currentOrder.customerId === customer.id || (!currentOrder.customerId && Boolean(customer.emailVerifiedAt && customer.email && currentOrder.customerEmail === customer.email)))) {
      return NextResponse.json({
        success: false,
        status: "REVIEW_REQUIRED",
        retryAllowed: false,
      }, { status: 409, headers });
    }

    const currentAttempt = currentOrder.paymentAttempts[0];

    retryAllowed =
      retryAllowed &&
      currentOrder.orderStatus === "PENDING" &&
      currentOrder.paymentStatus === "UNPAID" &&
      Boolean(currentAttempt && latestAttempt &&
        currentAttempt.id === latestAttempt.id &&
        currentAttempt.status === latestAttempt.status &&
        currentAttempt.razorpayOrderId === latestAttempt.razorpayOrderId);

    const result = {
      ...recoveryStatusFromOrder(currentOrder, retryAllowed),
      orderNumber: order.orderNumber,
      items: order.items.map(item => ({
        productId: item.productId,
        variantId: item.variantId ?? null,
        quantity: item.quantity,
      })),
    };
    return NextResponse.json(
      result.retryAllowed && retryAllowed && interrupted
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
