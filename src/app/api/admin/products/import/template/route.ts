import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { PRODUCT_IMPORT_COLUMNS } from "@/lib/admin/product-import-columns";

export async function GET() {
  if (!await getCurrentAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const csv = `\uFEFF${PRODUCT_IMPORT_COLUMNS.map(value => `"${value}"`).join(",")}\r\n`;
  return new NextResponse(csv, { headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": "attachment; filename=products-import-template.csv",
    "Cache-Control": "no-store",
  } });
}
