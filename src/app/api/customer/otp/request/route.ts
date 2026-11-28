import { NextRequest, NextResponse } from "next/server";
import { isValidRequestOrigin } from "@/lib/request-origin";
import { customerOtpEnabled, recordOtpActivity, trustedClientIp } from "@/lib/customer-otp";
import { normalizeIndianMobile } from "@/lib/customer-otp-core";
import { customerRateAllowed, customerRateCooldownAllowed } from "@/lib/customer-rate-limit";
import { retryMsg91Otp, sendMsg91Otp } from "@/lib/customer-otp-core";
import { msg91PendingRequestHash } from "@/lib/customer-otp-core";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "node:crypto";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isValidRequestOrigin(request)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  if (!await customerOtpEnabled()) return NextResponse.json({ error: "Mobile verification is temporarily unavailable." }, { status: 503 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const record = body as Record<string, unknown>;
  const phone = normalizeIndianMobile(record.phone);
  const action = record.action === "resend" ? "resend" : record.action === "send" ? "send" : null;
  if (!phone || !action) return NextResponse.json({ error: "Enter a valid Indian mobile number." }, { status: 400 });
  const requestId = typeof record.requestId === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(record.requestId) ? record.requestId : "";
  if (action === "resend" && !requestId) return NextResponse.json({ error: "Request a new verification code." }, { status: 400 });
  const pendingHash = requestId ? msg91PendingRequestHash(phone, requestId) : "";
  if (action === "resend" && !await prisma.customerOtpAccessToken.findUnique({ where: { tokenHash: pendingHash }, select: { id: true } })) {
    return NextResponse.json({ error: "This verification attempt expired. Request a new code." }, { status: 401 });
  }
  const ip = trustedClientIp(request);
  const [phoneAllowed, ipAllowed, dailyAllowed] = await Promise.all([
    customerRateAllowed(`otp-${action}-phone`, phone, action === "resend" ? 2 : 3, 15 * 60_000),
    ip ? customerRateAllowed(`otp-${action}-ip`, ip, action === "resend" ? 10 : 15, 15 * 60_000) : Promise.resolve(true),
    customerRateAllowed("otp-global-daily", new Date().toISOString().slice(0, 10), Number(process.env.CUSTOMER_OTP_MAX_DAILY_SENDS || 100), 36 * 60 * 60_000),
  ]);
  const cooldownAllowed = action === "resend" ? await customerRateCooldownAllowed("otp-resend-cooldown", phone, 60_000, 15 * 60_000) : true;
  if (!phoneAllowed || !ipAllowed || !dailyAllowed || !cooldownAllowed) {
    await recordOtpActivity(phone, "rate_limited", action);
    return NextResponse.json({ error: "Too many requests. Please wait before trying again." }, { status: 429 });
  }
  try {
    const settings = await prisma.storeSettings.findUnique({ where: { id: "primary" }, select: { customerOtpEnabled: true } });
    const authKey = process.env.MSG91_AUTH_KEY?.trim();
    const widgetId = process.env.MSG91_WIDGET_ID?.trim();
    if (!settings?.customerOtpEnabled || process.env.CUSTOMER_OTP_ENABLED !== "true" || !authKey || !widgetId) return NextResponse.json({ error: "Mobile verification is temporarily unavailable." }, { status: 503 });
    if (action === "send") {
      const providerRequestId = await sendMsg91Otp(phone, authKey, widgetId);
      await prisma.customerOtpAccessToken.create({ data: { id: randomUUID(), tokenHash: msg91PendingRequestHash(phone, providerRequestId), expiresAt: new Date(Date.now() + 10 * 60_000) } });
      await recordOtpActivity(phone, "success", "provider_sent");
      return NextResponse.json({ sent: true, requestId: providerRequestId }, { headers: { "Cache-Control": "no-store" } });
    }
    await retryMsg91Otp(widgetId, requestId, authKey);
    await recordOtpActivity(phone, "success", "provider_resent");
    return NextResponse.json({ sent: true, requestId }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    await recordOtpActivity(phone, "failure", "provider_send_failed");
    return NextResponse.json({ error: "Unable to send a verification code. Please wait and try again." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
