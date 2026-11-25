import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { validOrigin } from "@/lib/admin/origin";
import { recordInventoryMovement } from "@/lib/admin/inventory";
import { synchronizeAvailability } from "@/lib/admin/inventory-policy";
import { productInput } from "@/lib/admin/product-input";
import { assertManagedMediaAvailable } from "@/lib/admin/global-media-references";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const q = params.get("q")?.trim() || "";
  const categoryId = params.get("categoryId");
  const subcategoryId = params.get("subcategoryId");
  const status = params.get("status") || "all";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const limit = Math.min(100, Math.max(1, Number(params.get("limit")) || 20));

  if (status !== "all" && status !== "active" && status !== "inactive") {
    return NextResponse.json({ error: "Invalid status filter" }, { status: 400 });
  }

  const where = {
    ...(q ? {
      OR: [
        { name: { contains: q } },
        { slug: { contains: q } },
        { sku: { contains: q } },
      ],
    } : {}),
    ...(subcategoryId
      ? { categoryId: subcategoryId }
      : categoryId
        ? {
            category: {
              OR: [
                { id: categoryId },
                { parentId: categoryId },
              ],
            },
          }
        : {}),
    ...(status === "active" ? { isActive: true } : {}),
    ...(status === "inactive" ? { isActive: false } : {}),
  };

  try {
    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          category: {
            select: { id: true, name: true, slug: true },
          },
          _count: { select: { variants: true } },
        },
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.product.count({ where }),
    ]);

    return NextResponse.json({
      products,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Product list failed", error);
    return NextResponse.json(
      { error: "Unable to load products" },
      { status: 500 }
    );
  }
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
      return NextResponse.json(
        { error: "Select an existing active category" },
        { status: 400 }
      );
    }

    const availabilityStatus = synchronizeAvailability(
      data.stock,
      "IN_STOCK",
      data.availabilityStatus
    );

    const product = await prisma.$transaction(async tx => {
      await assertManagedMediaAvailable(tx, [data.images, data.specifications]);
      const created = await tx.product.create({
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description,
        shortDescription: data.shortDescription,
        price: data.price,
        originalPrice: data.originalPrice,
        pricingMode: data.pricingMode,
        pricePerMeter: data.pricePerMeter,
        stock: data.stock,
        availabilityStatus,
        sku: data.sku || null,
        images: data.images
          ? data.images as Prisma.InputJsonValue
          : Prisma.JsonNull,
        brand: data.brand,
        fabricMaterial: data.fabricMaterial,
        length: data.length,
        width: data.width,
        washCare: data.washCare,
        isActive: data.isActive,
        isFeatured: data.isFeatured,
        isNewArrival: data.isNewArrival,
        showColors: data.showColors,
        showSizes: data.showSizes,
        showMeters: data.showMeters,
        showSpecifications: data.showSpecifications,
        showFabricMaterial: data.showFabricMaterial,
        showLength: data.showLength,
        showWidth: data.showWidth,
        showWashCare: data.showWashCare,
        allowCOD: data.allowCOD,
        freeShipping: data.freeShipping,
        allowEnquiry: data.allowEnquiry,
        seoTitle: data.seoTitle,
        seoDescription: data.seoDescription,
        colors: data.colors
          ? data.colors as Prisma.InputJsonValue
          : Prisma.JsonNull,
        sizes: data.sizes
          ? data.sizes as Prisma.InputJsonValue
          : Prisma.JsonNull,
        meterOptions: data.meterOptions
          ? data.meterOptions as Prisma.InputJsonValue
          : Prisma.JsonNull,
        specifications: data.specifications
          ? data.specifications as Prisma.InputJsonValue
          : Prisma.JsonNull,
        categoryId: data.categoryId,
      },
      include: {
        category: { select: { id: true, name: true, slug: true } },
      },
      });

      if (data.stock > 0) {
        await recordInventoryMovement(tx, {
          productId: created.id,
          productName: created.name,
          productSku: created.sku,
          movementType: "INITIAL_STOCK",
          quantityChange: data.stock,
          quantityBefore: 0,
          quantityAfter: data.stock,
          note: "Opening inventory at product creation",
          performedBy: admin.email,
        });
      }
      return created;
    });

    return NextResponse.json({ success: true, product }, { status: 201 });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Product slug or SKU already exists" },
        { status: 409 }
      );
    }

    console.error("Product creation failed", error);
    return NextResponse.json(
      { error: "Unable to create product" },
      { status: 500 }
    );
  }
}
