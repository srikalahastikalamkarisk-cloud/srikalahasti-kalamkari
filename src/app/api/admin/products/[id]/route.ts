import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { validOrigin } from "@/lib/admin/origin";
import { productInput } from "@/lib/admin/product-input";
import { CatalogDeletionError, deleteProduct } from "@/lib/admin/catalog-deletion";
import { setProductInventory } from "@/lib/admin/inventory";
import { assertManagedMediaAvailable, queueReleasedMedia } from "@/lib/admin/global-media-references";
import { lockMediaMutation } from "@/lib/admin/media-mutation-lock";
import { registerProductImages } from "@/lib/admin/register-media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ id: string }>;
};

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(req: NextRequest, context: Context) {
  const admin = await getCurrentAdmin();

  if (!admin) return errorResponse("Unauthorized", 401);

  const { id } = await context.params;

  try {
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        variants: { orderBy: { sortOrder: "asc" } },
      },
    });

    if (!product) return errorResponse("Product not found", 404);

    return NextResponse.json({ product });
  } catch (error) {
    console.error("Product detail failed", error);
    return errorResponse("Unable to load product", 500);
  }
}

export async function PATCH(req: NextRequest, context: Context) {
  const admin = await getCurrentAdmin();

  if (!admin) return errorResponse("Unauthorized", 401);
  if (!validOrigin(req)) return errorResponse("Invalid origin", 403);

  const { id } = await context.params;
  const body = await req.json().catch(() => null);
  const parsed = productInput.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid product details",
        details: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  const data = parsed.data;

  try {
    const category = await prisma.category.findUnique({
      where: { id: data.categoryId },
      select: { id: true, isActive: true },
    });

    if (!category || !category.isActive) {
      return errorResponse("Select an existing active category", 400);
    }

    const {
      images,
      colors,
      sizes,
      meterOptions,
      specifications,
      ...scalarData
    } = data;

    const { product, cleanupCandidates } = await prisma.$transaction(async tx => {
      await lockMediaMutation(tx);
      const previous = await tx.product.findUniqueOrThrow({
        where: { id },
        select: { images: true, specifications: true }
      });
      await assertManagedMediaAvailable(tx, [images, specifications]);
      const inventory = await setProductInventory(tx, {
        productId: id,
        stock: data.stock,
        availabilityStatus: data.availabilityStatus,
        note: "Admin product edit",
        performedBy: admin.email,
      });
      const productFields: Partial<typeof scalarData> = { ...scalarData };
      delete productFields.stock;
      delete productFields.availabilityStatus;
      let updated = await tx.product.update({
        where: { id },
        data: {
          ...productFields,
          availabilityStatus: inventory.availabilityStatus,
          sku: productFields.sku || null,
          ...(images !== undefined
            ? { images: images as Prisma.InputJsonValue }
            : {}),
          ...(colors !== undefined
            ? { colors: colors as Prisma.InputJsonValue }
            : {}),
          ...(sizes !== undefined
            ? { sizes: sizes as Prisma.InputJsonValue }
            : {}),
          ...(meterOptions !== undefined
            ? { meterOptions: meterOptions as Prisma.InputJsonValue }
            : {}),
          ...(specifications !== undefined
            ? { specifications: specifications as Prisma.InputJsonValue }
            : {}),
        },
        include: {
          category: { select: { id: true, name: true, slug: true } },
        },
      });
      if (images !== undefined) {
        await registerProductImages(tx, id, images);

        updated = await tx.product.findUniqueOrThrow({
          where: { id },
          include: {
            category: {
              select: { id: true, name: true, slug: true }
            }
          }
        });
      }

      const cleanupCandidates = await queueReleasedMedia(
        tx, previous, updated
      );

      return { product: updated, cleanupCandidates };
    });

    return NextResponse.json({
      success: true,
      product,
      cleanupCandidates
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error) {
      if (error.code === "P2002") {
        return errorResponse("Product slug or SKU already exists", 409);
      }
      if (error.code === "P2025") {
        return errorResponse("Product not found", 404);
      }
      if (error.code === "P2003") {
        return errorResponse("Invalid product category", 409);
      }
    }

    console.error("Product update failed", error);
    return errorResponse("Unable to update product", 500);
  }
}

export async function DELETE(req: NextRequest, context: Context) {
  const admin = await getCurrentAdmin();

  if (!admin) return errorResponse("Unauthorized", 401);
  if (!validOrigin(req)) return errorResponse("Invalid origin", 403);

  const { id } = await context.params;
  const body = await req.json().catch(() => null);

  if (
    !body ||
    typeof body.confirmName !== "string" ||
    !body.confirmName.trim()
  ) {
    return errorResponse(
      "Type the exact product name to confirm permanent deletion",
      400
    );
  }

  try {
    const cleanupCandidates = await prisma.$transaction(async tx => {
      await lockMediaMutation(tx);
      const product = await tx.product.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          images: true,
          specifications: true,
          variants: {
            select: { imageUrl: true, attributes: true }
          }
        },
      });

      if (!product || product.name !== body.confirmName.trim()) {
        throw new Error("PRODUCT_CONFIRMATION_MISMATCH");
      }

      await deleteProduct(tx, id);

      return queueReleasedMedia(tx, product, null);
    });

    return NextResponse.json({
      success: true,
      cleanupCandidates
    });
  } catch (error) {
    if (error instanceof CatalogDeletionError && error.message === "PRODUCT_NOT_FOUND") {
      return errorResponse("Product not found", 404);
    }
    if (error instanceof Error && error.message === "PRODUCT_CONFIRMATION_MISMATCH") {
      return errorResponse(
        "Product not found or confirmation name does not match",
        409
      );
    }
    console.error("Product deletion failed", error);
    return errorResponse(
      "Unable to delete product. Check linked records first.",
      409
    );
  }
}
