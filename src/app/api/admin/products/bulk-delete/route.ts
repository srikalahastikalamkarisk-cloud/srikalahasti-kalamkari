import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/admin-auth";
import {
  CatalogDeletionError,
  deleteAllProducts,
  deleteSelectedProducts,
} from "@/lib/admin/catalog-deletion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const selectedSchema = z.object({
  productIds: z.array(z.string().min(1)).min(1).max(100),
  confirmation: z.literal("DELETE"),
}).strict();

const deleteAllSchema = z.object({
  deleteAll: z.literal(true),
  expectedCount: z.number().int().min(0),
  confirmation: z.literal("DELETE ALL PRODUCTS"),
}).strict();

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const count = await prisma.product.count();
  return NextResponse.json({ count });
}

export async function DELETE(req: NextRequest) {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (req.headers.get("origin") !== req.nextUrl.origin) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const all = deleteAllSchema.safeParse(body);
  const selected = all.success ? null : selectedSchema.safeParse(body);
  const selectedData = selected?.success ? selected.data : null;

  if (!all.success && !selectedData) {
    return NextResponse.json(
      { error: "Invalid request or deletion confirmation" },
      { status: 400 }
    );
  }

  try {
    const deletedCount = await prisma.$transaction(async tx => {
      if (all.success) {
        return deleteAllProducts(tx, all.data.expectedCount);
      }

      if (!selectedData) throw new CatalogDeletionError("Invalid deletion request");
      const productIds = selectedData.productIds;
      return deleteSelectedProducts(tx, productIds);
    }, { maxWait: 10000, timeout: 30000 });

    return NextResponse.json({ success: true, deletedCount });
  } catch (error) {
    if (error instanceof CatalogDeletionError) {
      const messages: Record<string, string> = {
        PRODUCT_COUNT_CHANGED: "Product count changed. Refresh and confirm again.",
        PRODUCTS_CHANGED: "Some products changed or no longer exist. Refresh and retry.",
        DUPLICATE_PRODUCT_IDS: "Duplicate product IDs are not allowed",
      };
      return NextResponse.json({ error: messages[error.message] ?? "Unable to delete products" }, { status: 409 });
    }

    console.error("Bulk product deletion failed", error);
    return NextResponse.json(
      { error: "Unable to delete products. Check linked records." },
      { status: 409 }
    );
  }
}
