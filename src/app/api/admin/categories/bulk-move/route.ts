import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { validOrigin } from "@/lib/admin/origin";

export const runtime = "nodejs";

const bulkMoveInput = z.object({
  categoryIds: z.array(z.string().min(1)).min(1).max(500),
  destinationParentId: z.string().min(1),
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

  if (!validOrigin(req)) {
    return NextResponse.json(
      { error: "Invalid origin" },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = bulkMoveInput.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid bulk move request" },
      { status: 400 }
    );
  }

  const { categoryIds, destinationParentId } = parsed.data;

  if (new Set(categoryIds).size !== categoryIds.length) {
    return NextResponse.json(
      { error: "Duplicate category IDs are not allowed" },
      { status: 400 }
    );
  }

  if (categoryIds.includes(destinationParentId)) {
    return NextResponse.json(
      { error: "A category cannot be its own parent" },
      { status: 400 }
    );
  }

  try {
    const result = await prisma.$transaction(async tx => {
      const destination = await tx.category.findUnique({
        where: { id: destinationParentId },
        select: { id: true, parentId: true },
      });

      if (!destination || destination.parentId !== null) {
        throw new BulkMoveConflict(
          "Select a valid main category as destination"
        );
      }

      const selected = await tx.category.findMany({
        where: { id: { in: categoryIds } },
        select: {
          id: true,
          parentId: true,
          sortOrder: true,
          name: true,
          _count: { select: { children: true } },
        },
      });

      if (selected.length !== categoryIds.length) {
        throw new BulkMoveConflict(
          "Some selected categories no longer exist. Refresh and retry."
        );
      }

      if (
        selected.some(
          category =>
            category.parentId === null ||
            category._count.children > 0
        )
      ) {
        throw new BulkMoveConflict(
          "Only subcategories without children can be moved"
        );
      }

      const moving = selected
        .filter(category =>
          category.parentId !== destinationParentId
        )
        .sort(
          (a, b) =>
            a.sortOrder - b.sortOrder ||
            a.name.localeCompare(b.name)
        );

      if (moving.length === 0) {
        return { count: 0 };
      }

      const last = await tx.category.aggregate({
        where: { parentId: destinationParentId },
        _max: { sortOrder: true },
      });

      let nextOrder = (last._max.sortOrder ?? 0) + 1;

      for (const category of moving) {
        await tx.category.update({
          where: { id: category.id },
          data: {
            parentId: destinationParentId,
            sortOrder: nextOrder++,
          },
        });
      }

      return { count: moving.length };
    }, {
      maxWait: 10000,
      timeout: 30000,
    });

    return NextResponse.json({
      success: true,
      movedCount: result.count,
    });
  } catch (error) {
    if (error instanceof BulkMoveConflict) {
      return NextResponse.json(
        { error: error.message },
        { status: 409 }
      );
    }

    console.error("Bulk category move failed", error);

    return NextResponse.json(
      { error: "Unable to move selected categories" },
      { status: 500 }
    );
  }
}
