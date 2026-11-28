import { resolveCustomerOrderImages } from "@/lib/orders/customer-order-images";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/customer-auth";
import { prisma } from "@/lib/prisma";
export async function GET(request: NextRequest, context: RouteContext<"/api/customer/account/orders/[id]">) {
  const customer = await getCurrentCustomer(); if (!customer) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { id } = await context.params;
  const order = await prisma.order.findFirst({ where: { id, customerEmail: customer.email }, include: { items: true } });
  return order ? NextResponse.json({ order: { ...order, items: await resolveCustomerOrderImages(order.items) } }, { headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ error: "Order not found." }, { status: 404 });
}
