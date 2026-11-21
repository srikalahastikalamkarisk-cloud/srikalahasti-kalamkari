import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { csvRow, imageUrlsFromJson, jsonCsvCell } from "@/lib/admin/product-csv";
import { PRODUCT_IMPORT_COLUMNS } from "@/lib/admin/product-import-columns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!await getCurrentAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const q = params.get("q")?.trim() || "";
  const categoryId = params.get("categoryId")?.trim() || "";
  const subcategoryId = params.get("subcategoryId")?.trim() || "";
  const status = params.get("status") || "all";
  if (q.length > 200 || categoryId.length > 191 || subcategoryId.length > 191 || !["all", "active", "inactive"].includes(status)) {
    return NextResponse.json({ error: "Invalid product export filters" }, { status: 400 });
  }

  const where = {
    ...(q ? { OR: [{ name: { contains: q } }, { slug: { contains: q } }, { sku: { contains: q } }] } : {}),
    ...(subcategoryId ? { categoryId: subcategoryId } : categoryId ? { category: { OR: [{ id: categoryId }, { parentId: categoryId }] } } : {}),
    ...(status === "active" ? { isActive: true } : status === "inactive" ? { isActive: false } : {}),
  };

  const encoder = new TextEncoder();
  let cancelled = false;
  let headerPending = true;
  let pageExhausted = false;
  let cursor: string | undefined;
  let pendingRows: string[] = [];
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (cancelled) return;
      if (headerPending) {
        headerPending = false;
        controller.enqueue(encoder.encode(`\uFEFF${csvRow(PRODUCT_IMPORT_COLUMNS)}`));
        return;
      }
      if (pendingRows.length) {
        controller.enqueue(encoder.encode(pendingRows.shift()!));
        return;
      }
      if (pageExhausted) {
        controller.close();
        return;
      }
      try {
          const products = await prisma.product.findMany({
            where,
            orderBy: { id: "asc" },
            take: 100,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            select: {
              id: true, name: true, sku: true, slug: true, shortDescription: true, description: true,
              pricingMode: true, price: true, originalPrice: true, pricePerMeter: true, stock: true,
              availabilityStatus: true, images: true, colors: true, sizes: true, meterOptions: true,
              specifications: true, isActive: true, isFeatured: true, isNewArrival: true,
              brand: true, fabricMaterial: true, length: true, width: true, washCare: true,
              showColors: true, showSizes: true, showMeters: true, showSpecifications: true,
              showFabricMaterial: true, showLength: true, showWidth: true, showWashCare: true,
              allowCOD: true, freeShipping: true, allowEnquiry: true, seoTitle: true, seoDescription: true,
              category: { select: { name: true, parent: { select: { name: true } } } },
              variants: {
                orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
                select: {
                  sku: true, colorName: true, colorHex: true, size: true, lengthMeters: true,
                  attributes: true, imageUrl: true, price: true, originalPrice: true, stock: true, isActive: true,
                },
              },
            },
          });
          if (cancelled) return;
          if (!products.length) {
            pageExhausted = true;
            controller.close();
            return;
          }
          pendingRows = products.map(product => {
            const category = product.category.parent?.name ?? product.category.name;
            const subcategory = product.category.parent ? product.category.name : "";
            const variants = product.variants.map(variant => ({
              ...variant,
              lengthMeters: variant.lengthMeters == null ? null : Number(variant.lengthMeters),
              price: variant.price == null ? null : Number(variant.price),
              originalPrice: variant.originalPrice == null ? null : Number(variant.originalPrice),
            }));
            const images = imageUrlsFromJson(product.images);
            const values = [
              product.id, product.name, product.sku, product.slug, category, subcategory,
              product.shortDescription, product.description, product.pricingMode, Number(product.price),
              product.originalPrice == null ? "" : Number(product.originalPrice),
              product.pricePerMeter == null ? "" : Number(product.pricePerMeter), product.stock,
              product.availabilityStatus, "", images.join(", "), jsonCsvCell(product.colors),
              jsonCsvCell(product.sizes), jsonCsvCell(product.meterOptions),
              jsonCsvCell(product.specifications), jsonCsvCell(variants), jsonCsvCell({
                showColors: product.showColors, showSizes: product.showSizes, showMeters: product.showMeters,
                showSpecifications: product.showSpecifications, showFabricMaterial: product.showFabricMaterial,
                showLength: product.showLength, showWidth: product.showWidth, showWashCare: product.showWashCare,
                allowCOD: product.allowCOD, freeShipping: product.freeShipping, allowEnquiry: product.allowEnquiry,
              }), product.isActive,
              product.isFeatured, product.isNewArrival, product.brand, product.fabricMaterial,
              product.length, product.width, product.washCare, product.showColors, product.showSizes,
              product.showMeters, product.showSpecifications, product.showFabricMaterial,
              product.showLength, product.showWidth, product.showWashCare, product.allowCOD,
              product.freeShipping, product.allowEnquiry, product.seoTitle, product.seoDescription,
            ];
            return csvRow(values);
          });
          cursor = products.at(-1)?.id;
          pageExhausted = products.length < 100;
          controller.enqueue(encoder.encode(pendingRows.shift()!));
      } catch (error) {
        console.error("Product CSV export failed", error);
        if (!cancelled) controller.error(new Error("Unable to finish the product export"));
      }
    },
    cancel() { cancelled = true; },
  });

  const suffix = status === "all" ? "all" : status;
  return new Response(body, { headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename=products-${suffix}.csv`,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  } });
}
