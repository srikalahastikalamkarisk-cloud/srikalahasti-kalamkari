import { NextRequest, NextResponse } from "next/server";
import { isValidRequestOrigin } from "@/lib/request-origin";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { setProductInventory } from "@/lib/admin/inventory";

export const runtime = "nodejs";

const inputSchema = z.object({
  productIds: z.array(z.string().min(1)).min(1).max(100),
  operation: z.enum(["set", "add", "subtract"]),
  value: z.number().int().min(0).max(1000000),
}).strict();

class BulkStockConflict extends Error {}

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
      { error: "Invalid bulk stock request" },
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

  try {
    const updatedCount = await prisma.$transaction(async tx => {
      // Serialize updates in stable order, then calculate each operation from
      // the latest committed stock values to avoid concurrent lost updates.
      for (const id of [...productIds].sort()) {
        await tx.$queryRaw`SELECT id FROM Product WHERE id = ${id} FOR UPDATE`;
      }

      const products = await tx.product.findMany({
        where: { id: { in: productIds } },
        select: {
          id: true,
          stock: true,
          _count: { select: { variants: true } },
        },
      });

      if (products.length !== productIds.length) {
        throw new BulkStockConflict(
          "Some products no longer exist. Refresh and retry."
        );
      }

      for (const product of products) {
        if (product._count.variants > 0) {
          throw new BulkStockConflict(
            "Products with variants require variant-level stock editing."
          );
        }

        const nextStock = operation === "set"
          ? value
          : operation === "add"
            ? product.stock + value
            : product.stock - value;

        if (nextStock < 0 || nextStock > 2147483647) {
          throw new BulkStockConflict(
            "Resulting stock must be between 0 and 2,147,483,647."
          );
        }

        await setProductInventory(tx, {
          productId: product.id,
          stock: nextStock,
          note: `Bulk inventory ${operation}`,
          performedBy: admin.email,
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
    if (error instanceof BulkStockConflict) {
      return NextResponse.json(
        { error: error.message },
        { status: 409 }
      );
    }

    console.error("Bulk stock update failed", error);

    return NextResponse.json(
      { error: "Unable to update product stock" },
      { status: 500 }
    );
  }
}
