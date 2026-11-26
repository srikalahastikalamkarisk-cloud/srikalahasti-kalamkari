import { compare, hash } from "bcryptjs";
import { isValidRequestOrigin } from "@/lib/request-origin";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentCustomer } from "@/lib/customer-auth";
import { prisma } from "@/lib/prisma";
import { strongCustomerPassword } from "@/lib/customer-auth-core";
import { sendPasswordChangedEmail } from "@/lib/customer-email";
import { customerRateAllowed } from "@/lib/customer-rate-limit";
const schema = z.object({ currentPassword: z.string().max(128), password: z.string().max(128), confirmPassword: z.string().max(128) }).refine(v => v.password === v.confirmPassword);
export async function POST(request: NextRequest) {
  if (!isValidRequestOrigin(request)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const customer = await getCurrentCustomer(); if (!customer) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!await customerRateAllowed("change-password", customer.id, 5, 15 * 60000)) return NextResponse.json({ error: "Please wait before trying again." }, { status: 429 });
  const parsed = schema.safeParse(await request.json()); if (!parsed.success || !strongCustomerPassword(parsed.data.password)) return NextResponse.json({ error: "Use a matching password with 6 to 128 characters." }, { status: 400 });
  const row = await prisma.customer.findUnique({ where: { id: customer.id }, select: { passwordHash: true } });
  if (!row || !(await compare(parsed.data.currentPassword, row.passwordHash))) return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
  await prisma.customer.update({ where: { id: customer.id }, data: { passwordHash: await hash(parsed.data.password, 12), sessionVersion: { increment: 1 } } });
  const response = NextResponse.json({ success: true, message: "Password changed. Sign in again with your new password." });
  response.cookies.set("sk_customer_session", "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  try { await sendPasswordChangedEmail(customer.email, customer.name); } catch { console.error("customer_password_changed_email_delivery_failed"); }
  return response;
}
