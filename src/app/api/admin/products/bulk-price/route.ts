import { NextRequest, NextResponse } from "next/server";
import { isValidRequestOrigin } from "@/lib/request-origin";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";

const inputSchema = z.object({
  productIds: z.array(z.string().min(1)).min(1).max(100),
  operation: z.enum(["set", "increase", "decrease"]),
  value: z.number().finite().positive().max(10000000),
}).strict();

class BulkPriceConflict extends Error {}

export async function PATCH(req: NextRequest) {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isValidRequestOrigin(req)) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = inputSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid bulk price request" },
      { status: 400 }
    );
  }

  const { productIds, operation, value } = parsed.data;

  if (new Set(productIds).size !== productIds.length) {
    return NextResponse.json(
      { error: "Duplicate product IDs are not allowed" },
      { status: 400 }
    );
  }

  if (operation !== "set" && value > 100) {
    return NextResponse.json(
      { error: "Percentage must be 100 or less" },
      { status: 400 }
    );
  }

  try {
    const updatedCount = await prisma.$transaction(async tx => {
      const products = await tx.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, price: true, pricingMode: true },
      });

      if (products.length !== productIds.length) {
        throw new BulkPriceConflict(
          "Some products no longer exist. Refresh and retry."
        );
      }

      const amount = new Prisma.Decimal(value);

      for (const product of products) {
        if (product.pricingMode !== "FIXED") {
          throw new BulkPriceConflict(
            "Bulk price editing currently supports FIXED pricing products only."
          );
        }

        let nextPrice: Prisma.Decimal;

        if (operation === "set") {
          nextPrice = amount;
        } else {
          const percent = amount.div(100);
          const multiplier = operation === "increase"
            ? new Prisma.Decimal(1).plus(percent)
            : new Prisma.Decimal(1).minus(percent);

          nextPrice = product.price.mul(multiplier);
        }

        nextPrice = nextPrice.toDecimalPlaces(
          2,
          Prisma.Decimal.ROUND_HALF_UP
        );

        if (nextPrice.lte(0) || nextPrice.gt(99999999.99)) {
          throw new BulkPriceConflict(
            "Resulting price must be between ₹0.01 and ₹99,999,999.99"
          );
        }

        await tx.product.update({
          where: { id: product.id },
          data: { price: nextPrice },
        });
      }

      return products.length;
    }, {
      maxWait: 10000,
      timeout: 30000,
    });

    return NextResponse.json({
      success: true,
      updatedCount,
    });
  } catch (error) {
    if (error instanceof BulkPriceConflict) {
      return NextResponse.json(
        { error: error.message },
        { status: 409 }
      );
    }

    console.error("Bulk price update failed", error);

    return NextResponse.json(
      { error: "Unable to update product prices" },
      { status: 500 }
    );
  }
}
