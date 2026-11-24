import { NextRequest, NextResponse } from "next/server";
import { isValidRequestOrigin } from "@/lib/request-origin";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";

const inputSchema = z.object({
  productIds: z.array(z.string().min(1)).min(1).max(100),
  categoryId: z.string().min(1),
}).strict();

class BulkMoveConflict extends Error {}

export async function PATCH(req: NextRequest) {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  if (!isValidRequestOrigin(req)) {
    return NextResponse.json(
      { error: "Invalid origin" },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = inputSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid bulk move request" },
      { status: 400 }
    );
  }

  const { productIds, categoryId } = parsed.data;

  if (new Set(productIds).size !== productIds.length) {
    return NextResponse.json(
      { error: "Duplicate product IDs are not allowed" },
      { status: 400 }
    );
  }

  try {
    const result = await prisma.$transaction(async tx => {
      const category = await tx.category.findUnique({
        where: { id: categoryId },
        select: { id: true },
      });

      if (!category) {
        throw new BulkMoveConflict("Destination category not found");
      }

      const existing = await tx.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true },
      });

      if (existing.length !== productIds.length) {
        throw new BulkMoveConflict(
          "Some products no longer exist. Refresh and retry."
        );
      }

      return tx.product.updateMany({
        where: { id: { in: productIds } },
        data: { categoryId },
      });
    });

    return NextResponse.json({
      success: true,
      updatedCount: result.count,
    });
  } catch (error) {
    if (error instanceof BulkMoveConflict) {
      return NextResponse.json(
        { error: error.message },
        { status: 409 }
      );
    }

    console.error("Bulk product category move failed", error);

    return NextResponse.json(
      { error: "Unable to move selected products" },
      { status: 500 }
    );
  }
}
