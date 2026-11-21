import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { validOrigin } from "@/lib/admin/origin";
import { fulfillmentEligible, isValidForwardTransition } from "@/lib/orders/fulfillment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ id: string }>;
};

const input = z.object({
  status: z.enum(["PROCESSING", "SHIPPED", "DELIVERED"]),
  courierName: z.string().trim().max(191).optional(),
  trackingNumber: z.string().trim().max(191).optional(),
  trackingUrl: z.union([
    z.literal(""),
    z.url().max(500).refine(
      value => value.startsWith("https://"),
      "HTTPS tracking URL required"
    ),
  ]).optional(),
}).strict();

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function PATCH(req: NextRequest, context: Context) {
  const admin = await getCurrentAdmin();

  if (!admin) return error("Unauthorized", 401);
  if (!validOrigin(req)) return error("Invalid origin", 403);

  const { id } = await context.params;

  if (!id || id.length > 191) {
    return error("Invalid order ID", 400);
  }

  const body = await req.json().catch(() => null);
  const parsed = input.safeParse(body);

  if (!parsed.success) {
    return error("Invalid order status or tracking details", 400);
  }

  const data = parsed.data;

  try {
    const result = await prisma.$transaction(async tx => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM \`Order\`
        WHERE id = ${id}
        FOR UPDATE
      `;

      if (!rows.length) {
        return { kind: "missing" as const };
      }

      const order = await tx.order.findUnique({
        where: { id },
      });

      if (!order) {
        return { kind: "missing" as const };
      }

      if (!fulfillmentEligible(order.paymentStatus, order.inventoryStatus)) {
        return { kind: "payment" as const };
      }

      if (!isValidForwardTransition(order.orderStatus, data.status)) {
        return { kind: "transition" as const };
      }

      if (data.status === "SHIPPED") {
        if (!data.courierName || !data.trackingNumber) {
          return { kind: "tracking" as const };
        }
      }

      const updated = await tx.order.update({
        where: { id },
        data: {
          orderStatus: data.status,
          ...(data.status === "SHIPPED"
            ? {
                courierName: data.courierName,
                trackingNumber: data.trackingNumber,
                trackingUrl: data.trackingUrl || null,
                shippedAt: new Date(),
              }
            : {}),
          ...(data.status === "DELIVERED"
            ? { deliveredAt: new Date() }
            : {}),
        },
        select: {
          id: true,
          orderNumber: true,
          orderStatus: true,
          paymentStatus: true,
          inventoryStatus: true,
          courierName: true,
          trackingNumber: true,
          trackingUrl: true,
          shippedAt: true,
          deliveredAt: true,
        },
      });

      return { kind: "success" as const, order: updated };
    }, {
      maxWait: 5000,
      timeout: 10000,
    });

    if (result.kind === "missing") {
      return error("Order not found", 404);
    }

    if (result.kind === "payment") {
      return error(
        "Payment must be PAID and inventory must be DEDUCTED.",
        409
      );
    }

    if (result.kind === "transition") {
      return error("Invalid order status transition.", 409);
    }

    if (result.kind === "tracking") {
      return error("Courier name and tracking number are required.", 400);
    }

    return NextResponse.json({
      success: true,
      order: result.order,
    });
  } catch (err) {
    console.error("Order status update failed", err);
    return error("Unable to update order status", 500);
  }
}
