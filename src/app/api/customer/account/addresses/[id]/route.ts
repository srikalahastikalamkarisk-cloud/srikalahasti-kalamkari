import { NextRequest, NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/customer-auth";
import { prisma } from "@/lib/prisma";
export async function DELETE(request: NextRequest, context: RouteContext<"/api/customer/account/addresses/[id]">) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const customer = await getCurrentCustomer(); if (!customer) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { id } = await context.params;
  const result = await prisma.customerAddress.deleteMany({ where: { id, customerId: customer.id } });
  return result.count ? NextResponse.json({ success: true }) : NextResponse.json({ error: "Address not found." }, { status: 404 });
}
