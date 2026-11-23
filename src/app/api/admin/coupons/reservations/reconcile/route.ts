import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { getRazorpayClient } from "@/lib/payments/razorpay";
import { reconcileCouponReservations } from "@/lib/checkout/coupon-reservation-reconciliation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  dryRun: z.boolean().default(true),
  confirm: z.literal(true).optional(),
  limit: z.number().int().min(1).max(50).default(25),
}).strict();

export async function POST(request: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (request.headers.get("origin") !== (
    process.env.APP_BASE_URL
      ? new URL(process.env.APP_BASE_URL).origin
      : request.nextUrl.origin
  )) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || (!parsed.data.dryRun && parsed.data.confirm !== true)) {
    return NextResponse.json(
      { error: "Invalid request. Non-dry-run reconciliation requires explicit confirmation." },
      { status: 400 }
    );
  }

  try {
    const razorpay = getRazorpayClient();
    const results = await reconcileCouponReservations({
      dryRun: parsed.data.dryRun,
      limit: parsed.data.limit,
      provider: {
        fetchOrder: async orderId => {
          const order = await razorpay.orders.fetch(orderId);
          return {
            id: order.id,
            status: order.status,
            amount: Number(order.amount),
            amount_paid: Number(order.amount_paid),
            amount_due: Number(order.amount_due),
            currency: order.currency,
            attempts: order.attempts,
          };
        },
        fetchPayments: async orderId => {
          const response = await razorpay.orders.fetchPayments(orderId);
          return response.items.map(payment => ({
            id: payment.id,
            order_id: payment.order_id,
            status: payment.status,
            captured: payment.captured,
            amount: Number(payment.amount),
            currency: payment.currency,
          }));
        },
        // Razorpay Orders exposes created/attempted/paid. It does not document
        // an irrevocable close/cancel state, so never release based on a guessed state.
      },
    });

    const summary = {
      RESERVED: 0,
      REDEEMED: 0,
      RELEASED: 0,
      NEEDS_REVIEW: 0,
    };
    for (const result of results) summary[result.status]++;

    return NextResponse.json(
      { success: true, dryRun: parsed.data.dryRun, summary, results },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Coupon reservation reconciliation failed:", error);
    return NextResponse.json(
      { error: "Coupon reconciliation could not be completed." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
