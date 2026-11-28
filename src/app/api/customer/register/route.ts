import { hash } from "bcryptjs";
import { isValidRequestOrigin } from "@/lib/request-origin";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { createCustomerToken, CUSTOMER_VERIFICATION_TTL_MS, strongCustomerPassword } from "@/lib/customer-auth-core";
import { sendVerificationEmail } from "@/lib/customer-email";
import { checkCustomerRateLimit } from "@/lib/customer-rate-limit";
import { customerAuthMethods } from "@/lib/customer-otp";

export const runtime = "nodejs";
const schema = z.object({ name: z.string().trim().min(2).max(120), email: z.string().trim().email().max(191), phone: z.string().trim().max(24).optional(), password: z.string().max(128), confirmPassword: z.string().max(128), termsAccepted: z.literal(true) }).refine(v => v.password === v.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match." });
const generic = () => NextResponse.json({ success: true, message: "If registration can be completed, an email will be sent with next steps." }, { headers: { "Cache-Control": "no-store" } });

export async function POST(request: NextRequest) {
  if (!(await customerAuthMethods()).emailPassword) return NextResponse.json({ error: "Email and password registration is disabled. Use mobile OTP if available." }, { status: 503 });
  const requestId = randomUUID();
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 128) || "unknown";
  if (!isValidRequestOrigin(request)) {
    console.warn("customer_registration_rejected", { requestId, category: "origin" });
    return NextResponse.json({ error: "Invalid request." }, { status: 400, headers: { "X-Request-Id": requestId } });
  }
  const ipLimit = await checkCustomerRateLimit("register-ip", address, 30, 60 * 60 * 1000);
  if (!ipLimit.allowed) {
    const retryAfter = ipLimit.retryAfterSeconds;
    console.warn("customer_registration_limited", { requestId, category: "ip_rate_limit", retryAfter });
    return NextResponse.json(
      { error: `Too many registration attempts. Please try again in about ${Math.ceil(retryAfter / 60)} minute(s).`, requestId },
      { status: 429, headers: { "Retry-After": String(retryAfter), "X-Request-Id": requestId, "Cache-Control": "no-store" } }
    );
  }
  try {
    const raw = await request.text();
    if (raw.length > 4096) {
      console.warn("customer_registration_rejected", { requestId, category: "request_size" });
      return NextResponse.json({ error: "Invalid registration details.", requestId }, { status: 413, headers: { "X-Request-Id": requestId, "Cache-Control": "no-store" } });
    }
    let input: unknown;
    try { input = JSON.parse(raw); } catch {
      console.warn("customer_registration_rejected", { requestId, category: "malformed_json" });
      return NextResponse.json({ error: "Invalid registration details.", requestId }, { status: 400, headers: { "X-Request-Id": requestId, "Cache-Control": "no-store" } });
    }
    const parsed = schema.safeParse(input);
    if (!parsed.success || !strongCustomerPassword(parsed.data?.password ?? "")) {
      console.warn("customer_registration_rejected", { requestId, category: "input_validation" });
      return NextResponse.json({ error: "Enter valid details and a password with 6 to 128 characters.", requestId }, { status: 400, headers: { "X-Request-Id": requestId, "Cache-Control": "no-store" } });
    }
    const data = parsed.data; const email = data.email.toLowerCase();
    const emailLimit = await checkCustomerRateLimit("register-email", email, 5, 60 * 60 * 1000);
    if (!emailLimit.allowed) {
      const retryAfter = emailLimit.retryAfterSeconds;
      console.warn("customer_registration_limited", { requestId, category: "email_rate_limit", retryAfter });
      return NextResponse.json(
        { error: `Too many attempts for this address. Please try again in about ${Math.ceil(retryAfter / 60)} minute(s).`, requestId },
        { status: 429, headers: { "Retry-After": String(retryAfter), "X-Request-Id": requestId, "Cache-Control": "no-store" } }
      );
    }
    const existing = await prisma.customer.findUnique({ where: { email }, select: { id: true, emailVerifiedAt: true } });
    if (!existing) {
      const customer = await prisma.customer.create({ data: { name: data.name, email, phone: data.phone || null, passwordHash: await hash(data.password, 12) }, select: { id: true } });
      const { token, tokenHash } = createCustomerToken(); const expiresAt = new Date(Date.now() + CUSTOMER_VERIFICATION_TTL_MS);
      await prisma.customerVerificationToken.create({ data: { customerId: customer.id, tokenHash, expiresAt } });
      try { await sendVerificationEmail(email, data.name, token); } catch {
        await prisma.customerVerificationToken.updateMany({ where: { tokenHash, usedAt: null }, data: { usedAt: new Date() } });
        console.error("customer_registration_failed", { requestId, category: "verification_email_delivery" });
      }
    }
    const response = generic();
    response.headers.set("X-Request-Id", requestId);
    return response;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : undefined;
    console.error("customer_registration_failed", { requestId, category: "registration_or_storage", name: error instanceof Error ? error.name : "UnknownError", ...(code ? { code } : {}) });
    return NextResponse.json({ error: "Unable to complete registration. Please try again.", requestId }, { status: 500, headers: { "X-Request-Id": requestId, "Cache-Control": "no-store" } });
  }
}
