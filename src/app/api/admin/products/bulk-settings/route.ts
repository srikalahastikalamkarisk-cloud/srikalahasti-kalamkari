import { NextRequest, NextResponse } from "next/server";
import { isValidRequestOrigin } from "@/lib/request-origin";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";

const inputSchema = z.object({
  productIds: z.array(z.string().min(1)).min(1).max(100),
  changes: z.object({
    isActive: z.boolean().optional(),
    isNewArrival: z.boolean().optional(),
    isFeatured: z.boolean().optional(),
    allowCOD: z.boolean().optional(),
    allowEnquiry: z.boolean().optional(),
  }).strict().refine(
    changes => Object.keys(changes).length > 0,
    "At least one setting is required"
  ),
}).strict();

class BulkSettingsConflict extends Error {}

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

  const parsed = inputSchema.safeParse(
    await req.json().catch(() => null)
  );

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid bulk settings request" },
      { status: 400 }
    );
  }

  const { productIds, changes } = parsed.data;

  if (new Set(productIds).size !== productIds.length) {
    return NextResponse.json(
      { error: "Duplicate product IDs are not allowed" },
      { status: 400 }
    );
  }

  try {
    const updatedCount = await prisma.$transaction(async tx => {
      const result = await tx.product.updateMany({
        where: { id: { in: productIds } },
        data: changes,
      });

      if (result.count !== productIds.length) {
        throw new BulkSettingsConflict(
          "Some products no longer exist. Refresh and retry."
        );
      }

      return result.count;
    }, {
      maxWait: 10000,
      timeout: 30000,
    });

    return NextResponse.json({
      success: true,
      updatedCount,
    });
  } catch (error) {
    if (error instanceof BulkSettingsConflict) {
      return NextResponse.json(
        { error: error.message },
        { status: 409 }
      );
    }

    console.error("Bulk settings update failed", error);

    return NextResponse.json(
      { error: "Unable to update product settings" },
      { status: 500 }
    );
  }
}
