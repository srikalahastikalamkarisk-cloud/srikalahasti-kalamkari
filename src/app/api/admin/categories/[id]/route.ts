import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { validOrigin } from "@/lib/admin/origin";
import { categoryInput, validImage } from "@/lib/admin/category-input";
import { CatalogDeletionError, deleteCategoryTree } from "@/lib/admin/catalog-deletion";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ id: string }>;
};

function responseError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function PATCH(req: NextRequest, context: Context) {
  const admin = await getCurrentAdmin();
  if (!admin) return responseError("Unauthorized", 401);
  if (!validOrigin(req)) return responseError("Invalid origin", 403);

  const { id } = await context.params;
  const body = await req.json().catch(() => null);
  const parsed = categoryInput.safeParse(body);

  if (!parsed.success) return responseError("Invalid category details", 400);

  const data = parsed.data;
  const parentId = data.parentId ?? null;

  if (!validImage(data.image)) {
    return responseError("Invalid image URL or upload path", 400);
  }

  if (parentId === id) {
    return responseError("A category cannot be its own parent", 400);
  }

  const existing = await prisma.category.findUnique({
    where: { id },
    select: {
      id: true,
      _count: { select: { children: true } },
    },
  });

  if (!existing) return responseError("Category not found", 404);

  if (parentId && existing._count.children > 0) {
    return responseError(
      "This main category has subcategories. Move them before converting it to a subcategory.",
      409
    );
  }

  if (parentId) {
    const parent = await prisma.category.findUnique({
      where: { id: parentId },
      select: { id: true, parentId: true },
    });

    if (!parent || parent.parentId !== null) {
      return responseError(
        "Select a valid main category as parent",
        400
      );
    }
  }

  try {
    const category = await prisma.category.update({
      where: { id },
      data: {
        name: data.name,
        slug: data.slug,
        image: data.image ?? null,
        isActive: data.isActive,
        parentId,
      },
    });

    return NextResponse.json({ category });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error) {
      if (error.code === "P2002") {
        return responseError("Category slug already exists", 409);
      }
      if (error.code === "P2025") {
        return responseError("Category not found", 404);
      }
      if (error.code === "P2003") {
        return responseError("Invalid parent category", 409);
      }
    }

    console.error("Category update failed", error);
    return responseError("Unable to update category", 500);
  }
}

export async function DELETE(req: NextRequest, context: Context) {
  const admin = await getCurrentAdmin();
  if (!admin) return responseError("Unauthorized", 401);
  if (!validOrigin(req)) return responseError("Invalid origin", 403);

  const { id } = await context.params;
  const body = await req.json().catch(() => null);
  const confirmation = z.object({
    confirmName: z.string().trim().min(1),
    expectedCategoryCount: z.number().int().min(1),
    expectedProductCount: z.number().int().min(0),
  }).strict().safeParse(body);

  if (!confirmation.success) {
    return responseError("Category confirmation and affected counts are required", 400);
  }

  try {
    const result = await prisma.$transaction(async tx => {
      return deleteCategoryTree(tx, {
        categoryId: id,
        confirmName: confirmation.data.confirmName,
        expectedCategoryCount: confirmation.data.expectedCategoryCount,
        expectedProductCount: confirmation.data.expectedProductCount,
      });
    }, { maxWait: 10000, timeout: 30000 });

    if (!result) return responseError("Category not found", 404);
    return NextResponse.json({
      success: true,
      ...result,
      sharedProductPolicy: "Products have one category and are deleted with that category.",
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error instanceof CatalogDeletionError && error.message === "CATEGORY_CONFIRMATION_MISMATCH") {
        return responseError("Category confirmation name does not match", 409);
      }
      if (error instanceof CatalogDeletionError && error.message === "CATEGORY_DELETE_COUNTS_CHANGED") {
        return responseError("Affected records changed. Refresh and confirm deletion again.", 409);
      }
      if (error instanceof CatalogDeletionError && error.message === "CATEGORY_TREE_CYCLE") {
        return responseError("Category hierarchy contains a cycle; deletion was canceled", 409);
      }
    }
    console.error("Category delete failed", error);
    return responseError("Unable to delete category", 500);
  }
}
