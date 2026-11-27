import { NextRequest, NextResponse } from "next/server";
import { getStorefrontCatalogPage } from "@/lib/storefront-products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function boundedNumber(value: string | null): number | undefined {
  if (value === null || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const requestedSort = params.get("sort");
  const sort = requestedSort === "name" || requestedSort === "price-asc" || requestedSort === "price-desc"
    ? requestedSort
    : "featured";
  const pageValue = Number(params.get("page")) || 1;

  try {
    const result = await getStorefrontCatalogPage({
      categorySlug: params.get("category") || undefined,
      subcategorySlug: params.get("subcategory") || undefined,
      query: params.get("q") || undefined,
      minPrice: boundedNumber(params.get("min")),
      maxPrice: boundedNumber(params.get("max")),
      pricedOnly: params.get("priced") === "1",
      sort,
      page: pageValue,
      pageSize: 12,
    });

    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    console.error("Storefront catalog query failed", error);
    return NextResponse.json(
      { error: "Unable to load the collection" },
      { status: 503, headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  }
}
