import { NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/customer-auth";
export const dynamic = "force-dynamic";
export async function GET() {
  const customer = await getCurrentCustomer();
  if (!customer) return NextResponse.json({ customer: null }, { status: 401, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ customer }, { headers: { "Cache-Control": "no-store" } });
}
