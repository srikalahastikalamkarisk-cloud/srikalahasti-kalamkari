import { NextRequest, NextResponse } from "next/server";
import { isValidRequestOrigin } from "@/lib/request-origin";
import { customerOtpEnabled, recordOtpActivity, trustedClientIp } from "@/lib/customer-otp";
import { normalizeIndianMobile } from "@/lib/customer-otp-core";
import { customerRateAllowed } from "@/lib/customer-rate-limit";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isValidRequestOrigin(request)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  if (!await customerOtpEnabled()) return NextResponse.json({ error: "Unavailable." }, { status: 503 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const phone = body && typeof body === "object" ? normalizeIndianMobile((body as Record<string, unknown>).phone) : null;
  if (!phone) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const ip = trustedClientIp(request);
  const [numberAllowed, ipAllowed] = await Promise.all([
    customerRateAllowed("otp-client-failure-phone", phone, 8, 15 * 60_000),
    ip ? customerRateAllowed("otp-client-failure-ip", ip, 30, 15 * 60_000) : Promise.resolve(true),
  ]);
  if (!numberAllowed || !ipAllowed) {
    await recordOtpActivity(phone, "rate_limited", "client_failure_report");
    return NextResponse.json({ error: "Rate limited." }, { status: 429 });
  }
  await recordOtpActivity(phone, "failure", "client_otp_verification");
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
