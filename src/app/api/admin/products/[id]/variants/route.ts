import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { validOrigin } from "@/lib/admin/origin";
import { recordInventoryMovement } from "@/lib/admin/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ id: string }>;
};

const variantSchema = z.object({
  id: z.string().trim().min(1).max(191).optional(),
  sku: z.string().trim().max(191).nullable().optional(),
  colorName: z.string().trim().max(100).nullable().optional(),
  colorHex: z.string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
  size: z.string().trim().max(50).nullable().optional(),
  lengthMeters: z.number().positive().finite().nullable().optional(),
  attributes: z.record(z.string().trim().min(1).max(100), z.string().trim().min(1).max(191)).nullable().optional(),
  imageUrl: z.string().trim().max(500).url().nullable().optional(),
  price: z.number().positive().finite().nullable().optional(),
  originalPrice: z.number().positive().finite().nullable().optional(),
  stock: z.number().int().min(0).max(10000000).default(0),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
}).strict().superRefine((data, ctx) => {
  if (data.isActive && (data.price == null || data.price <= 0)) {
    ctx.addIssue({
      code: "custom",
      path: ["price"],
      message: "Every active variant needs a selling price greater than zero",
    });
  }
  if (
    data.price != null &&
    data.originalPrice != null &&
    data.originalPrice <= data.price
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["originalPrice"],
      message: "Original price must exceed selling price",
    });
  }
});

const inputSchema = z.object({
  variants: z.array(variantSchema).max(200),
}).strict();

function canonicalAttributes(value: { attributes?: unknown; colorName?: string | null; size?: string | null; lengthMeters?: unknown }) {
  const suppliedAttributes = value.attributes && typeof value.attributes === "object" && !Array.isArray(value.attributes)
    ? value.attributes as Record<string, string>
    : null;
  const attributes = suppliedAttributes && Object.keys(suppliedAttributes).length > 0
    ? suppliedAttributes
    : {
        ...(value.colorName ? { Color: value.colorName } : {}),
        ...(value.size ? { Size: value.size } : {}),
        ...(value.lengthMeters != null ? { Length: `${Number(value.lengthMeters)}m` } : {}),
      };
  return JSON.stringify(Object.entries(attributes)
    .map(([name, option]) => [name.trim().toLowerCase(), String(option).trim().toLowerCase()])
    .sort(([a], [b]) => String(a).localeCompare(String(b))));
}

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function GET(
  _req: NextRequest,
  context: Context
) {
  const admin = await getCurrentAdmin();

  if (!admin) return errorResponse("Unauthorized", 401);

  const { id } = await context.params;

  try {
    const product = await prisma.product.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!product) return errorResponse("Product not found", 404);

    const variants = await prisma.productVariant.findMany({
      where: { productId: id },
      orderBy: [
        { sortOrder: "asc" },
        { createdAt: "asc" },
      ],
    });

    return NextResponse.json({ variants });
  } catch (error) {
    console.error("Variant list failed", error);
    return errorResponse("Unable to load product variants", 500);
  }
}

export async function PUT(
  req: NextRequest,
  context: Context
) {
  const admin = await getCurrentAdmin();

  if (!admin) return errorResponse("Unauthorized", 401);

  if (!validOrigin(req)) {
    return errorResponse("Invalid origin", 403);
  }

  const { id } = await context.params;
  const body = await req.json().catch(() => null);
  const parsed = inputSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid variant details",
        details: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  const variants = parsed.data.variants;

  const requestedIds = variants.map(variant => variant.id).filter((value): value is string => Boolean(value));
  if (new Set(requestedIds).size !== requestedIds.length) {
    return errorResponse("A variant may only be included once", 400);
  }

  const skuValues = variants
    .map(v => v.sku?.trim().toLowerCase())
    .filter((sku): sku is string => Boolean(sku));

  if (new Set(skuValues).size !== skuValues.length) {
    return errorResponse("Duplicate variant SKUs are not allowed", 400);
  }

  const combinations = variants.map(variant => canonicalAttributes(variant));
  const configuredCombinations = combinations.filter(value => value !== "[]");
  if (new Set(configuredCombinations).size !== configuredCombinations.length) {
    return errorResponse("Duplicate attribute combinations are not allowed", 400);
  }

  try {
    const result = await prisma.$transaction(async tx => {
      const lockedProducts = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM Product WHERE id = ${id} FOR UPDATE
      `;
      if (lockedProducts.length !== 1) throw new Error("PRODUCT_NOT_FOUND");
      const product = await tx.product.findUnique({
        where: { id },
        select: { id: true, name: true, sku: true, pricingMode: true, availabilityStatus: true, stock: true },
      });

      if (!product) {
        throw new Error("PRODUCT_NOT_FOUND");
      }

      if (
        product.pricingMode === "LENGTH_OPTIONS" &&
        variants.some(v => v.lengthMeters == null)
      ) {
        throw new Error("LENGTH_REQUIRED");
      }

      const previousVariants = await tx.productVariant.findMany({ where: { productId: id } });
      if (requestedIds.some(variantId => !previousVariants.some(variant => variant.id === variantId))) {
        throw new Error("VARIANT_PRODUCT_MISMATCH");
      }
      const matched = new Map<number, typeof previousVariants[number]>();
      const used = new Set<string>();
      for (const [index, variant] of variants.entries()) {
        const existing = variant.id
          ? previousVariants.find(row => row.id === variant.id)
          : previousVariants.find(row => !used.has(row.id) && canonicalAttributes(row) === canonicalAttributes(variant));
        if (existing && !used.has(existing.id)) {
          matched.set(index, existing);
          used.add(existing.id);
        }
      }
      // Free existing unique SKUs inside this transaction so values can be safely
      // reassigned between combinations without changing any variant identities.
      if (previousVariants.length) await tx.productVariant.updateMany({ where: { productId: id }, data: { sku: null } });

      for (const [index, variant] of variants.entries()) {
        const existing = matched.get(index);
        const data = {
          sku: variant.sku?.trim() || null,
          colorName: variant.colorName || null,
          colorHex: variant.colorHex || null,
          size: variant.size || null,
          lengthMeters: variant.lengthMeters ?? null,
          attributes: variant.attributes ?? undefined,
          imageUrl: variant.imageUrl || null,
          price: variant.price ?? null,
          originalPrice: variant.originalPrice ?? null,
          stock: variant.stock,
          isActive: variant.isActive,
          sortOrder: variant.sortOrder ?? index,
        };
        if (existing) await tx.productVariant.update({ where: { id: existing.id }, data });
        else await tx.productVariant.create({ data: { ...data, productId: id } });
      }

      for (const existing of previousVariants) {
        if (used.has(existing.id)) continue;
        // Keep removed combinations as inactive rows. This retains their stock,
        // price and identity for recovery, while order references stay intact.
        await tx.productVariant.update({ where: { id: existing.id }, data: { isActive: false, sku: null } });
      }

      const aggregate = await tx.productVariant.aggregate({
        where: { productId: id, isActive: true },
        _sum: { stock: true },
      });
      const stock = variants.length === 0 ? product.stock : aggregate._sum.stock ?? 0;
      await tx.product.update({
        where: { id },
        data: {
          stock,
          ...(product.availabilityStatus === "IN_STOCK" && stock === 0
            ? { availabilityStatus: "OUT_OF_STOCK" }
            : {}),
        },
      });
      const stockChange = stock - product.stock;
      if (stockChange !== 0) {
        await recordInventoryMovement(tx, {
          productId: product.id,
          productName: product.name,
          productSku: product.sku,
          movementType: "ADJUSTMENT",
          quantityChange: stockChange,
          quantityBefore: product.stock,
          quantityAfter: stock,
          note: "Variant inventory updated",
          performedBy: admin.email,
        });
      }

      return tx.productVariant.findMany({
        where: { productId: id },
        orderBy: { sortOrder: "asc" },
      });
    });

    return NextResponse.json({
      success: true,
      count: result.length,
      variants: result,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "PRODUCT_NOT_FOUND") {
        return errorResponse("Product not found", 404);
      }

      if (error.message === "LENGTH_REQUIRED") {
        return errorResponse(
          "Every variant needs a length in LENGTH_OPTIONS mode",
          400
        );
      }
      if (error.message === "VARIANT_PRODUCT_MISMATCH") {
        return errorResponse("A selected variant does not belong to this product", 400);
      }
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return errorResponse("A variant SKU already exists", 409);
    }

    console.error("Variant update failed", error);
    return errorResponse("Unable to save product variants", 500);
  }
}
