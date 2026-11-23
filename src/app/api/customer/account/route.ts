import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentCustomer } from "@/lib/customer-auth";
export const runtime = "nodejs";
const addressSchema = z.object({ name: z.string().trim().min(2).max(120), phone: z.string().trim().min(7).max(24), address: z.string().trim().min(5).max(1000), landmark: z.string().trim().max(191).optional().nullable(), city: z.string().trim().min(2).max(120), state: z.string().trim().min(2).max(120), pincode: z.string().trim().regex(/^\d{6}$/) });
export async function GET() {
  const customer = await getCurrentCustomer(); if (!customer) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const [profile, addresses, orders] = await Promise.all([
    prisma.customer.findUnique({ where: { id: customer.id }, select: { id: true, name: true, email: true, phone: true, emailVerifiedAt: true, createdAt: true } }),
    prisma.customerAddress.findMany({ where: { customerId: customer.id }, orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }] }),
    prisma.order.findMany({ where: { customerEmail: customer.email }, orderBy: { createdAt: "desc" }, select: { id: true, orderNumber: true, totalAmount: true, orderStatus: true, paymentStatus: true, createdAt: true } }),
  ]);
  return NextResponse.json({ profile, addresses, orders }, { headers: { "Cache-Control": "no-store" } });
}
export async function PATCH(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const customer = await getCurrentCustomer(); if (!customer) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const parsed = z.object({ name: z.string().trim().min(2).max(120), phone: z.string().trim().max(24).optional().nullable() }).safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid name and phone number." }, { status: 400 });
  const profile = await prisma.customer.update({ where: { id: customer.id }, data: { name: parsed.data.name, phone: parsed.data.phone || null }, select: { id: true, name: true, email: true, phone: true, emailVerifiedAt: true } });
  return NextResponse.json({ profile });
}
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const customer = await getCurrentCustomer(); if (!customer) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const parsed = addressSchema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: "Enter valid address details." }, { status: 400 });
  const count = await prisma.customerAddress.count({ where: { customerId: customer.id } });
  const address = await prisma.$transaction(async tx => {
    if (count === 0) await tx.customerAddress.updateMany({ where: { customerId: customer.id }, data: { isDefault: false } });
    return tx.customerAddress.create({ data: { ...parsed.data, customerId: customer.id, isDefault: count === 0 } });
  });
  return NextResponse.json({ address }, { status: 201 });
}
