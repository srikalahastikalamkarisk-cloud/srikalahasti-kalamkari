import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { validOrigin } from "@/lib/admin/origin";
import { categoryInput, validImage } from "@/lib/admin/category-input";
import { assertManagedMediaAvailable } from "@/lib/admin/global-media-references";

export const runtime = "nodejs";

export async function GET() {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const categories = await prisma.category.findMany({
    orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    include: {
      parent: { select: { id: true, name: true } },
      _count: { select: { products: true, children: true } },
    },
  });

  return NextResponse.json({ categories });
}

export async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!validOrigin(req)) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = categoryInput.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid category details" },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const parentId = data.parentId ?? null;

  if (!validImage(data.image)) {
    return NextResponse.json(
      { error: "Use a valid HTTPS image URL or uploaded category image path" },
      { status: 400 }
    );
  }

  if (parentId) {
    const parent = await prisma.category.findUnique({
      where: { id: parentId },
      select: { id: true, parentId: true },
    });

    if (!parent) {
      return NextResponse.json(
        { error: "Parent category not found" },
        { status: 400 }
      );
    }

    if (parent.parentId !== null) {
      return NextResponse.json(
        { error: "Only main categories can have subcategories" },
        { status: 400 }
      );
    }
  }

  try {
    const category = await prisma.$transaction(async tx => {
      await assertManagedMediaAvailable(tx, data.image);
      return tx.category.create({
        data: {
          name: data.name,
          slug: data.slug,
          image: data.image ?? null,
          isActive: data.isActive,
          parentId,
        },
      });
    });

    return NextResponse.json({ category }, { status: 201 });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error) {
      if (error.code === "P2002") {
        return NextResponse.json(
          { error: "Category slug already exists" },
          { status: 409 }
        );
      }
      if (error.code === "P2003") {
        return NextResponse.json(
          { error: "Parent category is no longer available" },
          { status: 409 }
        );
      }
    }

    console.error("Category create failed", error);
    return NextResponse.json(
      { error: "Unable to create category" },
      { status: 500 }
    );
  }
}
