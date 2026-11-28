import { randomBytes, randomUUID } from "node:crypto";
import { compare, hash } from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { isValidRequestOrigin } from "@/lib/request-origin";
import { prisma } from "@/lib/prisma";
import { getCurrentCustomer, createCustomerSession } from "@/lib/customer-auth";
import { CUSTOMER_COOKIE, CUSTOMER_SESSION_TTL_SECONDS } from "@/lib/customer-auth-core";
import { customerRateAllowed } from "@/lib/customer-rate-limit";
import { customerOtpEnabled, recordOtpActivity, trustedClientIp } from "@/lib/customer-otp";
import { z } from "zod";
import { msg91ConsumedTokenHash, msg91PendingRequestHash, normalizeIndianMobile, verifyMsg91AccessToken, verifyMsg91Otp } from "@/lib/customer-otp-core";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isValidRequestOrigin(request)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  if (!await customerOtpEnabled()) return NextResponse.json({ error: "Mobile sign-in is temporarily unavailable." }, { status: 503 });
  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 8192) return NextResponse.json({ error: "Invalid request." }, { status: 413 });
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    body = parsed as Record<string, unknown>;
  } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const phone = normalizeIndianMobile(body.phone);
  const otp = typeof body.otp === "string" && /^\d{6}$/.test(body.otp) ? body.otp : "";
  const requestId = typeof body.requestId === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(body.requestId) ? body.requestId : "";
  if (!phone || !otp || !requestId) return NextResponse.json({ error: "Enter a valid Indian mobile number and complete OTP verification." }, { status: 400 });
  const pendingHash = msg91PendingRequestHash(phone, requestId);
  const pendingRequest = await prisma.customerOtpAccessToken.findUnique({ where: { tokenHash: pendingHash }, select: { id: true, expiresAt: true } });
  if (!pendingRequest || pendingRequest.expiresAt <= new Date()) return NextResponse.json({ error: "This verification attempt expired. Request a new code." }, { status: 401 });
  const current = await getCurrentCustomer();
  const ip = trustedClientIp(request);
  const [phoneAllowed, ipAllowed] = await Promise.all([
    customerRateAllowed("otp-verify-phone", phone, 10, 15 * 60_000),
    ip ? customerRateAllowed("otp-verify-ip", ip, 30, 15 * 60_000) : Promise.resolve(true),
  ]);
  if (!phoneAllowed || !ipAllowed) {
    await recordOtpActivity(phone, "rate_limited", "verification");
    return NextResponse.json({ error: "Too many attempts. Please wait and try again." }, { status: 429 });
  }

  try {
    const authKey = process.env.MSG91_AUTH_KEY?.trim();
    const widgetId = process.env.MSG91_WIDGET_ID?.trim();
    if (!authKey || !widgetId) return NextResponse.json({ error: "Mobile verification is temporarily unavailable." }, { status: 503 });
    const accessToken = await verifyMsg91Otp(widgetId, requestId, otp, authKey);
    if (!accessToken) {
      await recordOtpActivity(phone, "failure", "provider_rejected");
      return NextResponse.json({ error: "We could not verify that code. Please request a new code." }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }
    const verification = await verifyMsg91AccessToken(accessToken, authKey, "https://api.msg91.com/api/v5/widget/verifyAccessToken");
    if (!verification.ok || verification.mobile !== phone) {
      await prisma.customerOtpAccessToken.deleteMany({ where: { id: pendingRequest.id } });
      await recordOtpActivity(phone, "failure", "provider_rejected");
      return NextResponse.json({ error: "We could not verify that code. Please request a new code." }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }
    const replayRecord = { id: randomUUID(), tokenHash: msg91ConsumedTokenHash(accessToken), expiresAt: new Date(Date.now() + 30 * 86400_000) };
    await prisma.customerOtpAccessToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    const consumeAttempt = async (tx: Pick<typeof prisma, "customerOtpAccessToken">) => {
      const consumed = await tx.customerOtpAccessToken.deleteMany({ where: { id: pendingRequest.id, tokenHash: pendingHash, expiresAt: { gt: new Date() } } });
      if (consumed.count !== 1) throw Object.assign(new Error("OTP attempt already consumed"), { code: "P2002" });
      await tx.customerOtpAccessToken.create({ data: replayRecord });
    };

    let customer;
    const emailVerificationRequired = false;
    if (current) {
      const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
      const identity = await prisma.customer.findUnique({ where: { id: current.id }, select: { passwordHash: true } });
      if (!identity || !await compare(currentPassword, identity.passwordHash)) {
        await prisma.customerOtpAccessToken.deleteMany({ where: { id: pendingRequest.id } });
        await recordOtpActivity(phone, "failure", "link_reauthentication_failed");
        return NextResponse.json({ error: "Confirm your account password before linking or changing your mobile number." }, { status: 403 });
      }
      customer = await prisma.$transaction(async tx => {
        await consumeAttempt(tx);
        return tx.customer.update({ where: { id: current.id }, data: { phone: `+${phone}`, normalizedPhone: phone, mobileVerifiedAt: new Date(), lastLoginAt: new Date(), lastLoginMethod: "mobile_otp", sessionVersion: { increment: 1 } } });
      });
    } else {
      customer = await prisma.customer.findUnique({ where: { normalizedPhone: phone } });
      if (!customer) {
        const input = z.object({ flow: z.literal("register"), name: z.string().trim().min(2).max(120), email: z.union([z.literal(""), z.string().trim().email().max(191)]).optional() }).safeParse(body);
        if (!input.success) {
          await prisma.customerOtpAccessToken.deleteMany({ where: { id: pendingRequest.id } });
          await recordOtpActivity(phone, "failure", "unlinked_number");
          return NextResponse.json({ code: "ACCOUNT_LINK_REQUIRED", error: "If you already have an account, sign in with email and verify your mobile in My Profile. New customers can register using mobile OTP." }, { status: 400 });
        }
        const email = input.data.email?.trim().toLowerCase() || null;
        const emailOwner = email ? await prisma.customer.findUnique({ where: { email }, select: { id: true } }) : null;
        if (emailOwner) {
          await prisma.customerOtpAccessToken.deleteMany({ where: { id: pendingRequest.id } });
          await recordOtpActivity(phone, "failure", "registration_conflict");
          return NextResponse.json({ code: "ACCOUNT_LINK_REQUIRED", error: "Sign in with your registered email and password, then verify your mobile number in My Profile." }, { status: 400 });
        }
        const randomPassword = randomBytes(48).toString("base64url");
        const hashedPassword = await hash(randomPassword, 12);
        customer = await prisma.$transaction(async tx => {
          await consumeAttempt(tx);
          return tx.customer.create({ data: { name: input.data.name, email, phone: `+${phone}`, normalizedPhone: phone, mobileVerifiedAt: new Date(), lastLoginAt: new Date(), lastLoginMethod: "mobile_otp", passwordHash: hashedPassword } });
        });
      } else if (!customer.mobileVerifiedAt) {
        await prisma.customerOtpAccessToken.deleteMany({ where: { id: pendingRequest.id } });
        return NextResponse.json({ code: "ACCOUNT_LINK_REQUIRED", error: "Sign in with email and verify your mobile number in My Profile before using mobile OTP." }, { status: 403 });
      } else {
        const customerId = customer.id;
        customer = await prisma.$transaction(async tx => {
          await consumeAttempt(tx);
          return tx.customer.update({ where: { id: customerId }, data: { lastLoginAt: new Date(), lastLoginMethod: "mobile_otp", sessionVersion: { increment: 1 } } });
        });
      }
    }
    const session = await createCustomerSession(customer.id, customer.sessionVersion);
    await recordOtpActivity(phone, "success", current ? "mobile_linked" : "verified_login_or_registration");
    const response = NextResponse.json({ success: true, returnTo: "/account", emailVerificationRequired }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(CUSTOMER_COOKIE, session, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: CUSTOMER_SESSION_TTL_SECONDS });
    return response;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") return NextResponse.json({ error: "This verification has already been used." }, { status: 401 });
    await recordOtpActivity(phone, "failure", error instanceof Error && error.name === "TimeoutError" ? "provider_timeout" : "service_error");
    return NextResponse.json({ error: "Mobile verification is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store", "X-Request-Id": randomUUID() } });
  }
}
