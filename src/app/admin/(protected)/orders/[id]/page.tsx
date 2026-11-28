import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import {
  ArrowLeft, MapPin, UserRound, Package,
  CreditCard, Truck
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { resolveCustomerOrderImages } from "@/lib/orders/customer-order-images";
import OrderFulfilmentPanel from "@/components/admin/order-fulfilment-panel";
import "../orders.css";

export const dynamic = "force-dynamic";

const money = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

export default async function OrderDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          productId: true,
          productName: true,
          productImage: true,
          productSku: true,
          variantSnapshot: true,
          quantity: true,
          unitPrice: true,
          totalPrice: true,
          createdAt: true,
        },
      },
      paymentAttempts: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          razorpayOrderId: true,
          status: true,
          amountPaise: true,
          currency: true,
          createdAt: true,
        },
      },
    },
  });

  if (!order) notFound();

  const orderItems = await resolveCustomerOrderImages(order.items);

  const webhookReviews = order.paymentAttempts.length
    ? await prisma.paymentWebhookEvent.findMany({
        where: {
          razorpayOrderId: { in: order.paymentAttempts.map(attempt => attempt.razorpayOrderId).filter((id): id is string => Boolean(id)) },
          status: "REVIEW",
        },
        select: { eventType: true, status: true, receivedAt: true },
        orderBy: { receivedAt: "desc" },
      })
    : [];

  return (
    <div className="skad-app">
      

      <main className="skad-main">
        <header className="skad-topbar">
          <div className="skad-breadcrumb">
            <span>STORE MANAGEMENT</span>
            <span className="skad-breadcrumb-divider">/</span>
            <Link href="/admin/orders">Orders</Link>
            <span className="skad-breadcrumb-divider">/</span>
            <strong>Order Details</strong>
          </div>
        </header>

        <div className="skad-content skorders-content">
          <Link href="/admin/orders" className="skorder-back">
            <ArrowLeft size={17} /> Back to Orders
          </Link>

          <div className="skorders-heading">
            <span className="skad-eyebrow">ORDER INFORMATION</span>
            <h1>{order.orderNumber}</h1>
            <p>
              Placed on{" "}
              {order.createdAt.toLocaleString("en-IN", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "Asia/Kolkata",
              })}
            </p>
          </div>

          <div className="skorder-status-grid">
            <article>
              <Package size={20} />
              <span>Order Status</span>
              <strong>{order.orderStatus}</strong>
            </article>
            <article>
              <CreditCard size={20} />
              <span>Payment Status</span>
              <strong>{order.paymentStatus}</strong>
            </article>
            <article>
              <Truck size={20} />
              <span>Shipping</span>
              <strong>
                {Number(order.shippingAmount) === 0
                  ? "FREE"
                  : money(Number(order.shippingAmount))}
              </strong>
            </article>
          </div>

          {order.orderStatus === "CANCELLED" &&
            order.paymentStatus === "PAID" && (
              <div role="alert" className="skorders-status">
                <strong>Payment reconciliation required</strong>
                <p>
                  Payment was confirmed for a cancelled order.
                  Do not fulfil this order until manually reviewed.
                </p>
              </div>
            )}

          <div className="skorder-layout">
            <div className="skorder-main-column">
              <section className="skorders-panel skorder-section">
                <div className="skorders-panel-heading">
                  <h2>Ordered Products</h2>
                </div>

                {orderItems.map(item => (
                  <article className="skorder-product" key={item.id}>
                    <div className="skorder-product-image">
                      {item.productImage?.startsWith("/uploads/products/") ||
                      item.productImage?.startsWith("/images/") ||
                      item.productImage?.startsWith("/api/media/products/") ? (
                        <Image
                          src={item.productImage}
                          alt={item.productName}
                          width={100}
                          height={115}
                          unoptimized
                        />
                      ) : (
                        <Package size={30} />
                      )}
                    </div>

                    <div className="skorder-product-info">
                      <h3>{item.productName}</h3>
                      {item.variantSnapshot && typeof item.variantSnapshot === "object" && !Array.isArray(item.variantSnapshot) && <p>{Object.entries(item.variantSnapshot as Record<string, unknown>).map(([name,value]) => `${name}: ${String(value)}`).join(" · ")}</p>}
                      {item.productSku && (
                        <p>SKU: {item.productSku}</p>
                      )}
                      <p>Quantity: {item.quantity}</p>
                      <p>Unit Price: {money(Number(item.unitPrice))}</p>
                    </div>

                    <strong>
                      {money(Number(item.totalPrice))}
                    </strong>
                  </article>
                ))}
              </section>

              <section className="skorders-panel skorder-section">
                <div className="skorders-panel-heading">
                  <h2>Order Summary</h2>
                </div>
                <div className="skorder-summary">
                  <div>
                    <span>Subtotal</span>
                    <strong>{money(Number(order.subtotal))}</strong>
                  </div>
                  <div>
                    <span>Shipping</span>
                    <strong>
                      {Number(order.shippingAmount) === 0
                        ? "FREE"
                        : money(Number(order.shippingAmount))}
                    </strong>
                  </div>
                  <div className="skorder-summary-total">
                    <span>Grand Total</span>
                    <strong>{money(Number(order.totalAmount))}</strong>
                  </div>
                </div>
              </section>

              <section className="skorders-panel skorder-section">
                <div className="skorders-panel-heading"><h2>Payment Attempts</h2></div>
                {order.paymentAttempts.length ? order.paymentAttempts.map(attempt => (
                  <article className="skorder-info" key={attempt.id}>
                    <strong>{attempt.status}</strong>
                    <p>{attempt.currency} {(attempt.amountPaise / 100).toFixed(2)} · {attempt.createdAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p>
                    {attempt.razorpayOrderId && <p>Razorpay order: {attempt.razorpayOrderId}</p>}
                  </article>
                )) : <p>No payment attempts recorded.</p>}
                {webhookReviews.length > 0 && <div role="alert" className="skorders-status"><strong>Webhook events need review</strong>{webhookReviews.map((event, index) => <p key={`${event.eventType}-${event.receivedAt.toISOString()}-${index}`}>{event.eventType} · {event.status} · {event.receivedAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p>)}</div>}
              </section>
            </div>

            <div className="skorder-side-column">
              <OrderFulfilmentPanel
                orderId={order.id}
                orderStatus={order.orderStatus}
                paymentStatus={order.paymentStatus}
                inventoryStatus={order.inventoryStatus}
                courierName={order.courierName}
                trackingNumber={order.trackingNumber}
                trackingUrl={order.trackingUrl}
                shippedAt={order.shippedAt?.toISOString() ?? null}
                deliveredAt={order.deliveredAt?.toISOString() ?? null}
              />

              <section className="skorders-panel skorder-section">
                <div className="skorders-panel-heading">
                  <h2><UserRound size={19} /> Customer</h2>
                </div>
                <div className="skorder-info">
                  <strong>{order.customerName}</strong>
                  <p>{order.customerPhone}</p>
                  <p>{order.customerEmail}</p>
                </div>
              </section>

              <section className="skorders-panel skorder-section">
                <div className="skorders-panel-heading">
                  <h2><MapPin size={19} /> Delivery Address</h2>
                </div>
                <address className="skorder-info">
                  {order.address}
                  {order.landmark && (
                    <p>Landmark: {order.landmark}</p>
                  )}
                  <p>{order.city}, {order.state}</p>
                  <p>PIN: {order.pincode}</p>
                </address>
              </section>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
