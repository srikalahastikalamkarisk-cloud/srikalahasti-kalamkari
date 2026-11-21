import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { validOrigin } from "@/lib/admin/origin";

export const runtime = "nodejs";

const groupSchema = z.object({
  parentId: z.string().min(1).nullable(),
  categoryIds: z.array(z.string().min(1)).min(1).max(500),
}).strict();

const reorderInput = z.object({
  groups: z.array(groupSchema).min(1).max(500),
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
  const parsed = reorderInput.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid category order" },
      { status: 400 }
    );
  }

  const groups = parsed.data.groups;
  const seenParents = new Set<string>();
  const seenCategories = new Set<string>();

  for (const group of groups) {
    const key = group.parentId ?? "__root__";

    if (seenParents.has(key)) {
      return NextResponse.json(
        { error: "Duplicate category groups" },
        { status: 400 }
      );
    }

    seenParents.add(key);

    for (const id of group.categoryIds) {
      if (seenCategories.has(id)) {
        return NextResponse.json(
          { error: "Duplicate category IDs" },
          { status: 400 }
        );
      }

      seenCategories.add(id);
    }
  }

  try {
    await prisma.$transaction(async tx => {
      // Validate every group before updating any order.
      for (const group of groups) {
        const siblings = await tx.category.findMany({
          where: { parentId: group.parentId },
          select: { id: true },
        });

        const expected = new Set(siblings.map(c => c.id));
        const supplied = new Set(group.categoryIds);

        if (
          expected.size !== supplied.size ||
          [...expected].some(id => !supplied.has(id))
        ) {
          throw new Error("CATEGORY_ORDER_CONFLICT");
        }
      }

      for (const group of groups) {
        for (const [index, id] of group.categoryIds.entries()) {
          await tx.category.update({
            where: { id },
            data: { sortOrder: index + 1 },
          });
        }
      }
    }, {
      maxWait: 10000,
      timeout: 30000,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "CATEGORY_ORDER_CONFLICT"
    ) {
      return NextResponse.json(
        { error: "Categories changed. Refresh and try again." },
        { status: 409 }
      );
    }

    console.error("Category reorder failed", error);

    return NextResponse.json(
      { error: "Unable to save category order" },
      { status: 500 }
    );
  }
}
