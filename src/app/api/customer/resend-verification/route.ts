import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { createCustomerToken, CUSTOMER_VERIFICATION_TTL_MS } from "@/lib/customer-auth-core";
import { sendVerificationEmail } from "@/lib/customer-email";
import { checkCustomerRateLimit } from "@/lib/customer-rate-limit";
export const runtime = "nodejs";
const generic = (requestId: string) => NextResponse.json({ success: true, message: "If this account needs verification, a new link will be sent." }, { headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  try {
    if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Invalid request.", requestId }, { status: 400, headers: { "X-Request-Id": requestId } });
    const body = await request.json(); const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 128) || "unknown";
    const limit = await checkCustomerRateLimit("verify", `${email}:${address}`, 5, 3600000);
    if (!limit.allowed) return NextResponse.json({ error: `Please try again in about ${Math.ceil(limit.retryAfterSeconds / 60)} minute(s).`, requestId }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds), "X-Request-Id": requestId, "Cache-Control": "no-store" } });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return generic(requestId);
    const customer = await prisma.customer.findUnique({ where: { email }, select: { id: true, name: true, email: true, emailVerifiedAt: true } });
    if (!customer || customer.emailVerifiedAt) return generic(requestId);
    const { token, tokenHash } = createCustomerToken(); const expiresAt = new Date(Date.now() + CUSTOMER_VERIFICATION_TTL_MS);
    await prisma.$transaction(async tx => { await tx.customerVerificationToken.updateMany({ where: { customerId: customer.id, usedAt: null }, data: { usedAt: new Date() } }); await tx.customerVerificationToken.create({ data: { customerId: customer.id, tokenHash, expiresAt } }); });
    try { await sendVerificationEmail(customer.email, customer.name, token); } catch (error) { await prisma.customerVerificationToken.updateMany({ where: { tokenHash, usedAt: null }, data: { usedAt: new Date() } }); console.error("customer_verification_email_delivery_failed", { requestId, category: "verification_email_delivery", name: error instanceof Error ? error.name : "UnknownError" }); }
    return generic(requestId);
  } catch (error) { console.error("customer_verification_resend_failed", { requestId, category: "resend_or_storage", name: error instanceof Error ? error.name : "UnknownError" }); return generic(requestId); }
}
