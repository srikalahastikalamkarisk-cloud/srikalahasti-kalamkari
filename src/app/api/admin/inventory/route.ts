import { NextRequest, NextResponse } from "next/server";
import { isValidRequestOrigin } from "@/lib/request-origin";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { setProductInventory } from "@/lib/admin/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const LOW_STOCK = 5;

export async function GET(request: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const q = params.get("q")?.trim() ?? "";
  const availability = params.get("availability") ?? "all";
  const lowStock = params.get("lowStock") === "true";
  const productId = params.get("productId");
  const page = Math.max(1, Number(params.get("page")) || 1);
  const limit = Math.min(100, Math.max(1, Number(params.get("limit")) || 25));

  if (!["all", "IN_STOCK", "OUT_OF_STOCK", "COMING_SOON"].includes(availability)) {
    return NextResponse.json({ error: "Invalid availability filter" }, { status: 400 });
  }

  try {
    if (productId) {
      const movements = await prisma.inventoryMovement.findMany({
        where: { productId },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      return NextResponse.json({ movements });
    }

    const where = {
      ...(q ? { OR: [
        { name: { contains: q } },
        { sku: { contains: q } },
        { category: { name: { contains: q } } },
      ] } : {}),
      ...(availability !== "all" ? { availabilityStatus: availability } : {}),
      ...(lowStock ? { stock: { lte: LOW_STOCK } } : {}),
    };

    const [products, total, lowStockCount] = await Promise.all([
      prisma.product.findMany({
        where,
        select: {
          id: true,
          name: true,
          sku: true,
          stock: true,
          availabilityStatus: true,
          pricingMode: true,
          updatedAt: true,
          category: { select: { id: true, name: true } },
          _count: { select: { variants: true } },
        },
        orderBy: [{ stock: "asc" }, { name: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.product.count({ where }),
      prisma.product.count({ where: {
        stock: { lte: LOW_STOCK },
        isActive: true,
        availabilityStatus: { not: "COMING_SOON" },
      } }),
    ]);

    return NextResponse.json({
      products,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      lowStockCount,
      lowStockThreshold: LOW_STOCK,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Admin inventory list failed", error);
    return NextResponse.json({ error: "Unable to load inventory" }, { status: 500 });
  }
}

const updateSchema = z.object({
  productId: z.string().min(1).max(191),
  stock: z.number().int().min(0).max(2147483647),
  availabilityStatus: z.enum(["IN_STOCK", "OUT_OF_STOCK", "COMING_SOON"]).optional(),
  note: z.string().trim().max(500).optional(),
}).strict();

export async function PATCH(request: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isValidRequestOrigin(request)) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid inventory update" }, { status: 400 });

  try {
    const result = await prisma.$transaction(async tx => setProductInventory(tx, {
      ...parsed.data,
      performedBy: admin.email,
    }), { maxWait: 10000, timeout: 20000 });
    return NextResponse.json({ success: true, inventory: result });
  } catch (error) {
    if (error instanceof Error && error.message === "PRODUCT_NOT_FOUND") {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    console.error("Inventory update failed", error);
    return NextResponse.json({ error: "Unable to update inventory" }, { status: 500 });
  }
}
