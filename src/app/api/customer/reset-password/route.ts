import { hash } from "bcryptjs";
import { isValidRequestOrigin } from "@/lib/request-origin";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { CUSTOMER_COOKIE, hashCustomerToken, validCustomerToken, strongCustomerPassword } from "@/lib/customer-auth-core";
import { sendPasswordChangedEmail } from "@/lib/customer-email";
import { customerRateAllowed } from "@/lib/customer-rate-limit";
export const runtime = "nodejs";
const schema = z.object({ token: z.string().max(64), password: z.string().max(128) });
export async function POST(request: NextRequest) {
  try {
    if (!isValidRequestOrigin(request)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    const parsed = schema.safeParse(await request.json()); if (!parsed.success || !validCustomerToken(parsed.data.token)) return NextResponse.json({ error: "Invalid reset link." , code: "invalid" }, { status: 400 }); if (!strongCustomerPassword(parsed.data.password)) return NextResponse.json({ error: "Your password does not meet the security requirements.", code: "invalid_password" }, { status: 400 });
    if (!await customerRateAllowed("reset-redeem", request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown", 12, 15 * 60000)) return NextResponse.json({ error: "Please wait before trying again." }, { status: 429 });
    const tokenHash = hashCustomerToken(parsed.data.token); const now = new Date(); const passwordHash = await hash(parsed.data.password, 12);
    const owner = await prisma.customerPasswordResetToken.findFirst({ where: { tokenHash, usedAt: null, expiresAt: { gt: now } }, select: { id: true, customerId: true } }); if (!owner) return NextResponse.json({ error: "This reset link has expired or was already used.", code: "expired" }, { status: 400 });
    const customer = await prisma.$transaction(async tx => {
      const customers = await tx.$queryRaw<Array<{ id: string; name: string; email: string }>>`SELECT id, name, email FROM Customer WHERE id = ${owner.customerId} FOR UPDATE`;
      const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM CustomerPasswordResetToken WHERE id = ${owner.id} AND tokenHash = ${tokenHash} AND usedAt IS NULL AND expiresAt > ${now} FOR UPDATE`;
      if (!customers[0] || !rows[0]) throw new Error("INVALID_RESET_TOKEN");
      const consumed = await tx.customerPasswordResetToken.updateMany({ where: { id: owner.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } }); if (consumed.count !== 1) throw new Error("INVALID_RESET_TOKEN");
      await tx.customerPasswordResetToken.updateMany({ where: { customerId: owner.customerId, usedAt: null }, data: { usedAt: now } });
      await tx.customer.update({ where: { id: owner.customerId }, data: { passwordHash, sessionVersion: { increment: 1 } } });
      return customers[0];
    });
    try { await sendPasswordChangedEmail(customer.email, customer.name); } catch { console.error("customer_password_changed_email_delivery_failed"); }
    const response = NextResponse.json({ success: true, message: "Password changed. Please sign in again." }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(CUSTOMER_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
    return response;
  } catch { return NextResponse.json({ error: "Unable to reset your password right now. Please try again.", code: "unavailable" }, { status: 503 }); }
}
