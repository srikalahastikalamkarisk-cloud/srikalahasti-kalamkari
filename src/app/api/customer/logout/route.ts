import { NextRequest, NextResponse } from "next/server";
import { CUSTOMER_COOKIE } from "@/lib/customer-auth-core";
import { getCurrentCustomer } from "@/lib/customer-auth";
import { prisma } from "@/lib/prisma";
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const customer = await getCurrentCustomer();
  if (customer) await prisma.customer.update({ where: { id: customer.id }, data: { sessionVersion: { increment: 1 } } });
  const response = NextResponse.json({ success: true });
  response.cookies.set(CUSTOMER_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
