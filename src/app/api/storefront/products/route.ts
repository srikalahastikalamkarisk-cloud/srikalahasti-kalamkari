import { NextRequest, NextResponse } from "next/server";
import { getStorefrontProductsByIds } from "@/lib/storefront-products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const ids = [...new Set((request.nextUrl.searchParams.get("ids") || "")
    .split(",").map(id => id.trim()).filter(Boolean))].slice(0, 200);
  try {
    const products = await getStorefrontProductsByIds(ids);
    return NextResponse.json(products, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    console.error("Storefront selected product query failed", error);
    return NextResponse.json({ error: "Unable to load selected products" }, {
      status: 503,
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  }
}
