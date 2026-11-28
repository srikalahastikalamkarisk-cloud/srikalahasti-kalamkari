import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { validOrigin } from "@/lib/admin/origin";
import { cancellationEligibility } from "@/lib/payments/cancellation-eligibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function POST(req: NextRequest, context: Context) {
  const admin = await getCurrentAdmin();
  if (!admin) return fail("Unauthorized", 401);
  if (!validOrigin(req)) return fail("Invalid origin", 403);

  const { id } = await context.params;
  if (!id || id.length > 191) return fail("Invalid order ID", 400);

  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const secret = process.env.RAZORPAY_KEY_SECRET?.trim();

  if (
    process.env.RAZORPAY_MODE !== "live" ||
    !keyId?.startsWith("rzp_live_") ||
    !secret
  ) {
    return fail("Razorpay LIVE verification is unavailable", 503);
  }

  try {
    const result = await prisma.$transaction(async tx => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM \`Order\` WHERE id = ${id} FOR UPDATE
      `;

      if (!locked.length) return "MISSING" as const;

      const order = await tx.order.findUnique({
        where: { id },
        include: { paymentAttempts: true },
      });

      if (!order) return "MISSING" as const;

      if (
        order.orderStatus !== "PENDING" ||
        order.paymentStatus !== "UNPAID" ||
        order.inventoryStatus !== "PENDING" ||
        order.paymentId ||
        order.paidAt ||
        order.inventoryDeductedAt
      ) {
        return "BLOCKED" as const;
      }

      if (order.paymentAttempts.some(a =>
        a.status === "CAPTURED" ||
        Boolean(a.razorpayPaymentId) ||
        a.status === "CREATING" ||
        !["CREATED", "FAILED"].includes(a.status) ||
        !a.razorpayOrderId
      )) {
        return "BLOCKED" as const;
      }

      const ids = new Set(
        order.paymentAttempts
          .map(a => a.razorpayOrderId)
          .filter((v): v is string => Boolean(v))
      );

      if (order.razorpayOrderId) ids.add(order.razorpayOrderId);

      const auth = "Basic " +
        Buffer.from(`${keyId}:${secret}`).toString("base64");

      for (const razorpayId of ids) {
        const expectedAmount = Number(order.totalAmount.mul(100));

        if (
          !Number.isSafeInteger(expectedAmount) ||
          expectedAmount <= 0 ||
          order.currency !== "INR"
        ) return "VERIFY_FAILED" as const;

        const providerResponse = await fetch(
          `https://api.razorpay.com/v1/orders/${encodeURIComponent(razorpayId)}`,
          {
            headers: { Authorization: auth },
            cache: "no-store",
            signal: AbortSignal.timeout(12000),
          }
        );

        if (!providerResponse.ok) {
          return "VERIFY_FAILED" as const;
        }

        const provider = await providerResponse.json();

        if (
          provider.id !== razorpayId ||
          provider.currency !== "INR" ||
          provider.amount !== expectedAmount ||
          provider.amount_paid !== 0 ||
          !["created", "attempted"].includes(provider.status)
        ) return "PAYMENT_FOUND" as const;

        const response = await fetch(
          `https://api.razorpay.com/v1/orders/${encodeURIComponent(razorpayId)}/payments?count=100&skip=0`,
          {
            headers: { Authorization: auth },
            cache: "no-store",
            signal: AbortSignal.timeout(12000),
          }
        );

        if (!response.ok) return "VERIFY_FAILED" as const;

        const data = await response.json();

        const eligibility = cancellationEligibility(
          razorpayId,
          expectedAmount,
          provider,
          data
        );

        if (eligibility !== "ELIGIBLE") return eligibility;

      }

      await tx.order.update({
        where: { id },
        data: { orderStatus: "CANCELLED" },
      });

      return "CANCELLED" as const;
    }, {
      isolationLevel: "ReadCommitted",
      maxWait: 10000,
      timeout: 60000,
    });

    if (result === "MISSING") return fail("Order not found", 404);
    if (result === "BLOCKED") {
      return fail("Order is not eligible for cancellation", 409);
    }
    if (result === "PAYMENT_FOUND") {
      return fail("Razorpay payment activity found. Manual review required.", 409);
    }
    if (result === "VERIFY_FAILED") {
      return fail("Could not verify Razorpay payments. Cancellation blocked.", 503);
    }

    return NextResponse.json({ success: true, status: "CANCELLED" });
  } catch (error) {
    console.error("Safe order cancellation failed", error);
    return fail("Unable to cancel order safely", 500);
  }
}
