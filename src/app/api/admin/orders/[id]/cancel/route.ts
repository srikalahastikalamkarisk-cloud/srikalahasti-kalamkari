import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { validOrigin } from "@/lib/admin/origin";

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
        (a.status === "CREATED" && !a.razorpayOrderId)
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
        const response = await fetch(
          `https://api.razorpay.com/v1/orders/${encodeURIComponent(razorpayId)}/payments?count=100&skip=0`,
          {
            headers: { Authorization: auth },
            cache: "no-store",
            signal: AbortSignal.timeout(12000),
          }
        );

        if (!response.ok) return "VERIFY_FAILED" as const;

        const data: {
          count?: number;
          items?: Array<{ status?: string }>;
        } = await response.json();

        if (
          !Array.isArray(data.items) ||
          typeof data.count !== "number"
        ) {
          return "VERIFY_FAILED" as const;
        }

        // Any payment activity, even a failed attempt, needs review.
        // Do not rely on only the first page of payment results.
        if (data.count > 0 || data.items.length > 0) {
          return "PAYMENT_FOUND" as const;
        }
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
