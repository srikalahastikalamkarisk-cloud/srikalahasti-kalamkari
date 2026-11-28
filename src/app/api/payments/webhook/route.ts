import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { reconcilePaidInventory } from "@/lib/payments/reconcile-paid-inventory";
import { verifyWebhookSignature } from "@/lib/payments/signatures";
import { readBoundedBody } from "@/lib/payments/request-guard-stream";
import { reconcileCouponRedemption } from "@/lib/checkout/reconcile-coupon-redemption";
import { isAuthoritativePaidOrder } from "@/lib/payments/order-paid-validation";
import { getRazorpayClient } from "@/lib/payments/razorpay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const responseHeaders = {
  "Cache-Control": "no-store",
};

type PaymentEntity = {
  id?: unknown;
  order_id?: unknown;
  amount?: unknown;
  currency?: unknown;
  status?: unknown;
  captured?: unknown;
};

type WebhookBody = {
  event?: unknown;
  payload?: {
    payment?: {
      entity?: PaymentEntity;
    };
    order?: {
      entity?: {
        id?: unknown;
        amount?: unknown;
        amount_paid?: unknown;
        currency?: unknown;
        status?: unknown;
      };
    };
  };
};

type PaidOrderEntity = {
  id?: unknown;
  amount?: unknown;
  amount_paid?: unknown;
  currency?: unknown;
  status?: unknown;
};

function response(
  body: Record<string, unknown>,
  status = 200
) {
  return NextResponse.json(body, {
    status,
    headers: responseHeaders,
  });
}

export async function POST(request: NextRequest) {
  let verifiedEventType: string | undefined;
  let verifiedPayment: PaymentEntity | undefined;
  let verifiedOrder: PaidOrderEntity | undefined;
  let authoritativeOrderPaid = false;

  try {
    const signature = request.headers.get(
      "x-razorpay-signature"
    );

    const eventId = request.headers.get(
      "x-razorpay-event-id"
    );

    if (
      !signature ||
      !/^[a-f0-9]{64}$/i.test(signature) ||
      !eventId ||
      eventId.length > 191 ||
      !/^[a-zA-Z0-9_-]+$/.test(eventId)
    ) {
      return response(
        { error: "Invalid webhook headers." },
        400
      );
    }

    const contentType =
      request.headers.get("content-type") || "";

    if (
      !contentType.toLowerCase().startsWith("application/json")
    ) {
      return response(
        { error: "Invalid content type." },
        415
      );
    }

    if (!request.body) {
      return response(
        { error: "Webhook body is required." },
        400
      );
    }

    // Preserve exact bytes for Razorpay HMAC verification.
    const bounded = await readBoundedBody(
      request.body,
      1_048_576
    );

    if (!bounded.ok) {
      return response(
        { error: "Invalid or oversized webhook body." },
        bounded.status
      );
    }

    const rawBody = Buffer.from(bounded.body);

    // Verify signature before parsing or processing the event.
    if (
      !verifyWebhookSignature({
        rawBody,
        signature,
      })
    ) {
      return response(
        { error: "Webhook signature verification failed." },
        401
      );
    }

    let body: WebhookBody;

    try {
      body = JSON.parse(rawBody.toString("utf8"));
    } catch {
      return response(
        { error: "Invalid webhook JSON." },
        400
      );
    }

    const eventType = body.event;

    if (typeof eventType !== "string") {
      return response(
        { error: "Missing webhook event type." },
        400
      );
    }

    const payment = body.payload?.payment?.entity;
    const paidOrder = body.payload?.order?.entity;

    if (
      eventType === "payment.captured" ||
      eventType === "payment.failed"
    ) {
      if (
        !payment ||
        typeof payment.id !== "string" ||
        !/^pay_[A-Za-z0-9]+$/.test(payment.id) ||
        typeof payment.order_id !== "string" ||
        !/^order_[A-Za-z0-9]+$/.test(payment.order_id)
      ) {
        return response(
          { error: "Invalid payment event payload." },
          400
        );
      }

      if (
        !Number.isSafeInteger(payment.amount) ||
        (payment.amount as number) <= 0 ||
        payment.currency !== "INR"
      ) {
        return response(
          { error: "Invalid payment amount or currency." },
          400
        );
      }

      if (
        eventType === "payment.captured" &&
        (payment.status !== "captured" ||
          payment.captured !== true)
      ) {
        return response(
          { error: "Payment is not confirmed as captured." },
          400
        );
      }

      if (
        eventType === "payment.failed" &&
        payment.status !== "failed"
      ) {
        return response(
          { error: "Payment failure is not confirmed." },
          400
        );
      }
    }

    if (eventType === "order.paid") {
      if (
        !paidOrder ||
        typeof paidOrder.id !== "string" ||
        !/^order_[A-Za-z0-9]+$/.test(paidOrder.id) ||
        !Number.isSafeInteger(paidOrder.amount) ||
        !Number.isSafeInteger(paidOrder.amount_paid) ||
        (paidOrder.amount as number) <= 0 ||
        paidOrder.amount_paid !== paidOrder.amount ||
        paidOrder.currency !== "INR" ||
        paidOrder.status !== "paid"
      ) {
        return response({ error: "Invalid paid-order event payload." }, 400);
      }

      verifiedOrder = paidOrder;
      // A signed webhook is necessary but the provider's current order record
      // is also checked before this event can mark a local order as paid.
      const providerOrder = await getRazorpayClient().orders.fetch(paidOrder.id);
      // Local amount is checked again under the order lock below.
      authoritativeOrderPaid = isAuthoritativePaidOrder({
        expectedOrderId: paidOrder.id,
        expectedAmountPaise: paidOrder.amount as number,
        payload: paidOrder,
        provider: providerOrder,
      });
    }

    // These values are available to the duplicate-event catch handler
    // only after the webhook signature and payload checks pass.
    verifiedEventType = eventType;
    verifiedPayment = payment;

    const result = await prisma.$transaction(async tx => {
      await tx.paymentWebhookEvent.create({
        data: {
          eventId,
          eventType,
          razorpayOrderId:
            typeof payment?.order_id === "string"
              ? payment.order_id
              : typeof paidOrder?.id === "string"
                ? paidOrder.id
                : null,
          status: "RECEIVED",
        },
      });

      const finishEvent = async (status: string) => {
        await tx.paymentWebhookEvent.update({
          where: { eventId },
          data: {
            status,
            processedAt: new Date(),
          },
        });
      };

      // Other subscribed or future events are recorded,
      // but never treated as successful payments.
      if (
        eventType !== "payment.captured" &&
        eventType !== "payment.failed" &&
        eventType !== "order.paid"
      ) {
        await finishEvent("IGNORED");
        return "IGNORED" as const;
      }

      const paymentOrderId = eventType === "order.paid"
        ? paidOrder!.id as string
        : payment!.order_id as string;
      const paymentId = payment?.id as string | undefined;

      const initialAttempt = await tx.paymentAttempt.findFirst({
        where: {
          razorpayOrderId: paymentOrderId,
        },
      });

      if (!initialAttempt) {
        await finishEvent("REVIEW");
        return "REVIEW" as const;
      }

      // Serialize payment updates for this order.
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM \`Order\`
        WHERE id = ${initialAttempt.orderId}
        FOR UPDATE
      `;

      // Re-read payment attempt after acquiring the order lock.
      const attempt = await tx.paymentAttempt.findUnique({
        where: { id: initialAttempt.id },
      });

      if (
        !attempt ||
        attempt.orderId !== initialAttempt.orderId ||
        attempt.razorpayOrderId !== paymentOrderId
      ) {
        await finishEvent("REVIEW");
        return "REVIEW" as const;
      }

      const order = await tx.order.findUnique({
        where: { id: attempt.orderId },
      });

      if (!order) {
        await finishEvent("REVIEW");
        return "REVIEW" as const;
      }

      if (
        order.razorpayOrderId !== paymentOrderId ||
        !order.totalAmount.mul(100).isInteger() ||
        !order.totalAmount.mul(100).equals(attempt.amountPaise) ||
        order.currency !== "INR" ||
        attempt.currency !== "INR" ||
        (eventType === "order.paid"
          ? !authoritativeOrderPaid ||
            paidOrder!.amount !== attempt.amountPaise ||
            paidOrder!.amount_paid !== attempt.amountPaise ||
            paidOrder!.currency !== attempt.currency
          : attempt.amountPaise !== payment!.amount ||
            attempt.currency !== payment!.currency)
      ) {
        await finishEvent("REVIEW");
        return "REVIEW" as const;
      }

      if (order.orderStatus === "CANCELLED") {
        // A cancelled order must never be automatically fulfilled.
        // Preserve confirmed payment evidence for manual reconciliation.
        if (
          eventType === "payment.captured" ||
          eventType === "order.paid"
        ) {
          const capturedId =
            eventType === "payment.captured" ? paymentId : undefined;

          if (
            capturedId &&
            (
              (order.paymentId && order.paymentId !== capturedId) ||
              (attempt.razorpayPaymentId &&
               attempt.razorpayPaymentId !== capturedId)
            )
          ) {
            await finishEvent("REVIEW");
            return "REVIEW" as const;
          }

          await tx.paymentAttempt.update({
            where: { id: attempt.id },
            data: {
              status: "CAPTURED",
              ...(capturedId
                ? { razorpayPaymentId: capturedId }
                : {}),
            },
          });

          await tx.order.update({
            where: { id: order.id },
            data: {
              paymentStatus: "PAID",
              paidAt: order.paidAt ?? new Date(),
              inventoryStatus: "REVIEW_REQUIRED",
              ...(capturedId ? { paymentId: capturedId } : {}),
            },
          });
        }

        await finishEvent("REVIEW");
        return "REVIEW" as const;
      }

      if (eventType === "order.paid") {
        if (order.paymentStatus === "PAID") {
          await finishEvent("PROCESSED");
          return "ALREADY_PAID" as const;
        }

        await tx.paymentAttempt.update({
          where: { id: attempt.id },
          data: { status: "CAPTURED" },
        });
        await tx.order.update({
          where: { id: order.id },
          data: { paymentStatus: "PAID", paidAt: order.paidAt ?? new Date() },
        });
        await finishEvent("PROCESSED");
        return "PAID" as const;
      }

      if (eventType === "payment.captured") {
        if (order.paymentStatus === "PAID") {
          if (order.paymentId && order.paymentId !== paymentId) {
            await finishEvent("REVIEW");
            return "REVIEW" as const;
          }

          if (!order.paymentId) {
            await tx.paymentAttempt.update({
              where: { id: attempt.id },
              data: { razorpayPaymentId: paymentId, status: "CAPTURED" },
            });
            await tx.order.update({
              where: { id: order.id },
              data: { paymentId, paidAt: order.paidAt ?? new Date() },
            });
          }

          await finishEvent("PROCESSED");
          return "ALREADY_PAID" as const;
        }

        if (
          attempt.razorpayPaymentId &&
          attempt.razorpayPaymentId !== paymentId
        ) {
          await finishEvent("REVIEW");
          return "REVIEW" as const;
        }

        await tx.paymentAttempt.update({
          where: { id: attempt.id },
          data: {
            razorpayPaymentId: paymentId,
            status: "CAPTURED",
          },
        });

        await tx.order.update({
          where: { id: order.id },
          data: {
            paymentId,
            paymentStatus: "PAID",
            paidAt: new Date(),
          },
        });

        await finishEvent("PROCESSED");
        return "PAID" as const;
      }

      // A late failure event must never downgrade a paid order.
      if (
        order.paymentStatus === "PAID" ||
        attempt.status === "CAPTURED"
      ) {
        await finishEvent("PROCESSED");
        return "ALREADY_PAID" as const;
      }

      await tx.paymentAttempt.update({
        where: { id: attempt.id },
        data: { status: "FAILED" },
      });

      await finishEvent("PROCESSED");
      return "FAILED" as const;
    }, {
      isolationLevel: "ReadCommitted",
      maxWait: 10000,
      timeout: 20000,
    });

    // Payment transaction has committed before stock reconciliation.
    // Inventory failure must not roll back a captured payment.
    let inventoryStatus: string | undefined;
    let couponStatus: string | undefined;

    if (
      (eventType === "payment.captured" || eventType === "order.paid") &&
      (result === "PAID" || result === "ALREADY_PAID")
    ) {
      const paidAttempt = await prisma.paymentAttempt.findFirst({
        where: { razorpayOrderId: eventType === "order.paid" ? paidOrder!.id as string : payment!.order_id as string },
        select: { orderId: true },
      });

      if (paidAttempt) {
        couponStatus = await reconcileCouponRedemption(paidAttempt.orderId);
        try {
          inventoryStatus = await reconcilePaidInventory(paidAttempt.orderId);
        } catch (error) {
          console.error(
            "Webhook inventory reconciliation failed:",
            error instanceof Error ? error.name : "UnknownError"
          );
          inventoryStatus = "REVIEW_REQUIRED";
        }
      }
    }

    return response({
      success: true,
      result,
      duplicate: false,
      reviewRequired: result === "REVIEW" ||
        inventoryStatus === "REVIEW_REQUIRED" ||
        couponStatus === "REVIEW_REQUIRED",
      couponStatus,
      inventoryStatus,
    });
  } catch (error) {
    // A unique event ID conflict means Razorpay retried
    // an event that has already been recorded.
    const code =
      error && typeof error === "object" &&
      "code" in error
        ? error.code
        : undefined;

    if (code === "P2002") {
      try {
        const eventId = request.headers.get("x-razorpay-event-id");

        if (eventId) {
          const existing = await prisma.paymentWebhookEvent.findUnique({
            where: { eventId },
            select: { eventType: true, status: true },
          });

          if (existing) {
            let inventoryStatus: string | undefined;
            let couponStatus: string | undefined;

            if (
              existing.eventType === "payment.captured" &&
              existing.status === "PROCESSED" &&
              verifiedEventType === "payment.captured" &&
              verifiedPayment &&
              typeof verifiedPayment.id === "string" &&
              typeof verifiedPayment.order_id === "string" &&
              typeof verifiedPayment.amount === "number" &&
              verifiedPayment.currency === "INR"
            ) {
              const attempt = await prisma.paymentAttempt.findFirst({
                where: {
                  razorpayOrderId: verifiedPayment.order_id,
                  razorpayPaymentId: verifiedPayment.id,
                  status: "CAPTURED",
                },
                select: {
                  orderId: true,
                  amountPaise: true,
                  currency: true,
                },
              });

              if (
                attempt &&
                attempt.amountPaise === verifiedPayment.amount &&
                attempt.currency === verifiedPayment.currency
              ) {
                const order = await prisma.order.findUnique({
                  where: { id: attempt.orderId },
                  select: {
                    paymentStatus: true,
                    paymentId: true,
                    razorpayOrderId: true,
                  },
                });

                if (
                  order?.paymentStatus === "PAID" &&
                  order.paymentId === verifiedPayment.id &&
                  order.razorpayOrderId === verifiedPayment.order_id
                ) {
                  couponStatus = await reconcileCouponRedemption(
                    attempt.orderId
                  );
                  inventoryStatus = await reconcilePaidInventory(
                    attempt.orderId
                  );
                }
              }
            }

            if (
              existing.eventType === "order.paid" &&
              existing.status === "PROCESSED" &&
              verifiedEventType === "order.paid" &&
              authoritativeOrderPaid &&
              verifiedOrder &&
              typeof verifiedOrder.id === "string" &&
              typeof verifiedOrder.amount === "number" &&
              verifiedOrder.currency === "INR"
            ) {
              const attempt = await prisma.paymentAttempt.findFirst({
                where: {
                  razorpayOrderId: verifiedOrder.id,
                  status: "CAPTURED",
                  amountPaise: verifiedOrder.amount,
                  currency: "INR",
                },
                select: { orderId: true },
              });
              if (attempt) {
                const order = await prisma.order.findUnique({
                  where: { id: attempt.orderId },
                  select: { paymentStatus: true, razorpayOrderId: true },
                });
                if (order?.paymentStatus === "PAID" && order.razorpayOrderId === verifiedOrder.id) {
                  couponStatus = await reconcileCouponRedemption(attempt.orderId);
                  inventoryStatus = await reconcilePaidInventory(attempt.orderId);
                }
              }
            }

            return response({
              success: true,
              duplicate: true,
              couponStatus,
              inventoryStatus,
              reviewRequired: inventoryStatus === "REVIEW_REQUIRED" ||
                couponStatus === "REVIEW_REQUIRED",
            });
          }
        }
      } catch (retryError) {
        console.error(
          "Duplicate webhook retry failed:",
          retryError instanceof Error ? retryError.name : "UnknownError"
        );
      }
    }

    console.error("Payment webhook processing failed.");

    return response(
      { error: "Webhook processing requires retry." },
      500
    );
  }
}
