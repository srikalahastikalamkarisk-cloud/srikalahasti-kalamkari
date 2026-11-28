import { NextResponse } from "next/server";
import { customerAuthMethods } from "@/lib/customer-otp";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const methods = await customerAuthMethods();
  return NextResponse.json({ enabled: methods.mobileOtp, ...methods }, { headers: { "Cache-Control": "no-store" } });
}
