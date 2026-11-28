import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import PremiumHeader from "@/components/storefront-header";
import PremiumFooter from "@/components/premium-footer";
import { getCurrentCustomer } from "@/lib/customer-auth";
import { prisma } from "@/lib/prisma";
import "@/components/shop-account-pages.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Order Confirmation | Srikalahasti Kalamkari",
  robots: { index: false, follow: false },
};

export default async function OrderSuccess({
  searchParams,
}: {
  searchParams: Promise<{
    order?: string | string[];
  }>;
}) {
  const customer = await getCurrentCustomer();

  if (!customer) {
    redirect("/login");
  }

  const { order: reference } = await searchParams;

  if (
    typeof reference !== "string" ||
    !reference ||
    reference.length > 191
  ) {
    notFound();
  }

  const order = await prisma.order.findFirst({
    where: {
      orderNumber: reference,
      OR: [{ customerId: customer.id }, ...(customer.emailVerifiedAt && customer.email ? [{ customerEmail: customer.email, customerId: null }] : [])],
      paymentStatus: "PAID",
      orderStatus: { not: "CANCELLED" },
    },
    include: { items: true },
  });

  if (!order) {
    notFound();
  }

  const money = (amount: string) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(amount));

  return (
    <>
      <PremiumHeader />

      <main className="skaccount skaccount--checkout">
        <div className="skaccount-wrap">
          <section className="skcheckout">
            <div className="skoc">
              <div className="skoc-card">

                <div className="skoc-icon" aria-hidden="true">
                  <svg width="44" height="44"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="m7 12 3 3 7-7"/>
                  </svg>
                </div>

                <span className="skoc-eyebrow">
                  PAYMENT SUCCESSFUL
                </span>

                <h2>Thank you for your order!</h2>

                <p className="skoc-description">
                  Thank you for choosing Srikalahasti Kalamkari.
                  Your payment has been securely verified.
                </p>

                <div className="skoc-details">
                  <div>
                    <span>Order Number</span>
                    <strong>{order.orderNumber}</strong>
                  </div>

                  <div>
                    <span>Payment Status</span>
                    <strong className="skoc-paid">
                      Paid Successfully
                    </strong>
                  </div>

                  <div>
                    <span>Amount Paid</span>
                    <strong>
                      {money(order.totalAmount.toString())}
                    </strong>
                  </div>

                  <div>
                    <span>Payment Gateway</span>
                    <strong>Razorpay</strong>
                  </div>
                </div>

                <div className="skoc-next">
                  <h3>Your handcrafted selection</h3>

                  {order.items.map(item => (
                    <div className="skca-product" key={item.id}>
                      {item.productImage ? (
                        <img
                          src={item.productImage}
                          alt={item.productName}
                          loading="lazy"
                        />
                      ) : (
                        <div className="skca-placeholder">
                          Kalamkari
                        </div>
                      )}

                      <div className="skca-product-info">
                        <strong>{item.productName}</strong>
                        <span>Qty: {item.quantity}</span>
                        <b>{money(item.totalPrice.toString())}</b>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="skoc-next">
                  <h3>What happens next?</h3>

                  <div className="skoc-step">
                    <span>01</span>
                    <div>
                      <strong>Payment confirmed</strong>
                      <p>Your payment has been verified.</p>
                    </div>
                  </div>

                  <div className="skoc-step">
                    <span>02</span>
                    <div>
                      <strong>Order preparation</strong>
                      <p>Our team will review and prepare your order.</p>
                    </div>
                  </div>

                  <div className="skoc-step">
                    <span>03</span>
                    <div>
                      <strong>Shipping and delivery</strong>
                      <p>Follow your order updates in your account.</p>
                    </div>
                  </div>
                </div>

                <div className="skoc-actions">
                  <Link
                    href={`/account/orders/${encodeURIComponent(order.id)}`}
                    className="skoc-primary">
                    View My Order →
                  </Link>

                  <Link
                    href="/shop"
                    className="skoc-secondary">
                    Continue Shopping
                  </Link>
                </div>

                <p className="skoc-secure">
                  Secure payment powered by Razorpay
                </p>

              </div>
            </div>
          </section>
        </div>
      </main>

      <PremiumFooter />
    </>
  );
}
