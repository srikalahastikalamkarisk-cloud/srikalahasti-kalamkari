import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createCustomerToken, CUSTOMER_RESET_TTL_MS } from "@/lib/customer-auth-core";
import { sendCustomerResetEmail } from "@/lib/customer-email";
import { customerRateAllowed } from "@/lib/customer-rate-limit";
export const runtime = "nodejs";
const generic = () => NextResponse.json({ success: true, message: "If an account matches that address, reset instructions will be sent." }, { headers: { "Cache-Control": "no-store" } });
export async function POST(request: NextRequest) {
  try {
    if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    const body = await request.json(); const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""; const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const [ipAllowed, emailAllowed] = await Promise.all([customerRateAllowed("reset-request-ip", address, 20, 3600000), customerRateAllowed("reset-request-email", email || "invalid", 5, 3600000)]);
    if (!ipAllowed || !emailAllowed) return NextResponse.json({ error: "Please wait before trying again." }, { status: 429 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return generic();
    const customer = await prisma.customer.findUnique({ where: { email }, select: { id: true, email: true, name: true } }); if (!customer) return generic();
    const { token, tokenHash } = createCustomerToken(); const expiresAt = new Date(Date.now() + CUSTOMER_RESET_TTL_MS);
    await prisma.$transaction(async tx => { await tx.customerPasswordResetToken.updateMany({ where: { customerId: customer.id, usedAt: null }, data: { usedAt: new Date() } }); await tx.customerPasswordResetToken.create({ data: { customerId: customer.id, tokenHash, expiresAt } }); });
    try { await sendCustomerResetEmail(customer.email, customer.name, token); } catch { await prisma.customerPasswordResetToken.updateMany({ where: { tokenHash, usedAt: null }, data: { usedAt: new Date() } }); console.error("customer_password_reset_email_delivery_failed"); }
    return generic();
  } catch { return generic(); }
}
