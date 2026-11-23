import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentCustomer } from "@/lib/customer-auth";
import { prisma } from "@/lib/prisma";
import "@/components/customer-auth.css";
export const dynamic = "force-dynamic";
export default async function OrderDetails({ params }: PageProps<"/account/orders/[id]">) {
  const customer = await getCurrentCustomer(); if (!customer) redirect(`/login?returnTo=${encodeURIComponent("/account/orders")}`);
  const { id } = await params;
  const order = await prisma.order.findFirst({ where: { id, customerEmail: customer.email }, include: { items: true } }); if (!order) notFound();
  return <main className="skauth-page skauth-account-page"><section className="skauth-shell skauth-order-shell"><Link href="/account">← My account</Link><h1>{order.orderNumber}</h1><p>{order.orderStatus} · {order.paymentStatus}</p><p>Placed {order.createdAt.toLocaleDateString("en-IN")}</p><section className="skauth-account-section"><h2>Delivery</h2><p>{order.customerName}<br/>{order.address}<br/>{order.city}, {order.state} {order.pincode}</p></section><section className="skauth-account-section"><h2>Items</h2>{order.items.map(item=><p key={item.id}>{item.productName} × {item.quantity} · ₹{item.totalPrice.toString()}</p>)}<strong>Total: ₹{order.totalAmount.toString()}</strong></section></section></main>;
}
