import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { validOrigin } from "@/lib/admin/origin";

export const runtime = "nodejs";

const bulkInput = z.object({
  categoryIds: z.array(z.string().min(1)).min(1).max(500),
  isActive: z.boolean(),
}).strict();

export async function PATCH(req: NextRequest) {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  if (!validOrigin(req)) {
    return NextResponse.json(
      { error: "Invalid origin" },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = bulkInput.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid bulk category request" },
      { status: 400 }
    );
  }

  const { categoryIds, isActive } = parsed.data;
  const uniqueIds = [...new Set(categoryIds)];

  if (uniqueIds.length !== categoryIds.length) {
    return NextResponse.json(
      { error: "Duplicate category IDs are not allowed" },
      { status: 400 }
    );
  }

  try {
    const result = await prisma.$transaction(async tx => {
      const existing = await tx.category.findMany({
        where: { id: { in: uniqueIds } },
        select: { id: true },
      });

      if (existing.length !== uniqueIds.length) {
        throw new Error("CATEGORY_BULK_CONFLICT");
      }

      return tx.category.updateMany({
        where: { id: { in: uniqueIds } },
        data: { isActive },
      });
    });

    return NextResponse.json({
      success: true,
      updatedCount: result.count,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "CATEGORY_BULK_CONFLICT"
    ) {
      return NextResponse.json(
        { error: "Some categories no longer exist. Refresh and retry." },
        { status: 409 }
      );
    }

    console.error("Bulk category update failed", error);

    return NextResponse.json(
      { error: "Unable to update selected categories" },
      { status: 500 }
    );
  }
}
