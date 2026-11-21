"use client";

import { useState, useRef, useEffect } from "react";
import { clearPurchasedItems } from "@/lib/shop-state";

type Customer = {
  name: string;
  phone: string;
  email: string;
  address: string;
  landmark: string;
  city: string;
  state: string;
  pincode: string;
};

type CheckoutItem = {
  productId: string;
  quantity: number;
  variantId?: string;
};

type Preview = {
  success: boolean;
  subtotalPaise: number;
  shippingPaise: number;
  discountPaise: number;
  couponCode: string | null;
  totalPaise: number;
  freeShipping: boolean;
  paymentEnabled: boolean;
  orderCreated: boolean;
  message: string;
};

const initial: Customer = {
  name: "",
  phone: "",
  email: "",
  address: "",
  landmark: "",
  city: "",
  state: "",
  pincode: "",
};

const money = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);

export default function CheckoutCustomerForm({
  subtotal,
  items,
  buyNowOnly = false,
  checkoutBlocked = false,
  displayProducts = [],
  onRemoveProduct,
}: {
  subtotal: number;
  items: CheckoutItem[];
  buyNowOnly?: boolean;
  checkoutBlocked?: boolean;
  onRemoveProduct?: (id: string, variantId?: string) => void;
  displayProducts?: {
    id: string;
    name: string;
    image: string | null;
    quantity: number;
    price: number;
    variantId?: string;
    variantLabel?: string;
  }[];
}) {
  const [customer, setCustomer] = useState<Customer>(initial);
  const [couponCode, setCouponCode] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [paidOrder, setPaidOrder] = useState("");
  const [confirmationPending, setConfirmationPending] = useState(false);
  const [checkingRecovery, setCheckingRecovery] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const checkoutKeyRef = useRef("");
  const paymentLock = useRef(false);
  const reviewVersion = useRef(0);
  const pendingStorageKey = "sk-pending-live-checkout-v1";
  const [recoveryChecked, setRecoveryChecked] = useState(false);

  useEffect(() => {
    const recover = () => {
      try {
        if (sessionStorage.getItem(pendingStorageKey)) {
          setConfirmationPending(true);
        }
      } catch {
        setConfirmationPending(true);
      }
      setRecoveryChecked(true);
    };

    queueMicrotask(recover);
  }, []);



  const cartKey = JSON.stringify(items);
  const [reviewedCartKey, setReviewedCartKey] = useState("");

  const verifiedPreview =
    reviewedCartKey === cartKey && recoveryChecked
      ? preview
      : null;

  function update(field: keyof Customer, value: string) {
    reviewVersion.current += 1;
    setCustomer(previous => ({ ...previous, [field]: value }));
    setPreview(null);
    checkoutKeyRef.current = "";
    setError("");
  }

  function updateCoupon(value: string) {
    reviewVersion.current += 1;
    setCouponCode(value.toUpperCase());
    setPreview(null);
    checkoutKeyRef.current = "";
    setError("");
  }

  async function reviewOrder(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (loading || confirmationPending || paying || checkoutBlocked) return;

    const version = ++reviewVersion.current;
    const reviewedItems = JSON.stringify(items);

    setLoading(true);
    setError("");
    setPreview(null);

    try {
      const response = await fetch("/api/checkout/preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          customer,
          items,
          couponCode: couponCode.trim() || null,
        }),
      });

      const data: unknown = await response.json();

      if (!data || typeof data !== "object") {
        throw new Error("Invalid server response.");
      }

      const result = data as Record<string, unknown>;

      if (!response.ok) {
        const issues = Array.isArray(result.issues)
          ? result.issues
              .filter(
                (issue): issue is {
                  path: string;
                  message: string;
                } =>
                  issue !== null &&
                  typeof issue === "object" &&
                  typeof issue.path === "string" &&
                  typeof issue.message === "string"
              )
              .map(issue =>
                `${issue.path || "Checkout"}: ${issue.message}`
              )
          : [];

        throw new Error(
          issues.length > 0
            ? issues.join(" | ")
            : typeof result.error === "string"
              ? result.error
              : "Unable to verify order."
        );
      }

      if (
        result.success !== true ||
        typeof result.subtotalPaise !== "number" ||
        typeof result.shippingPaise !== "number" ||
        typeof result.discountPaise !== "number" ||
        typeof result.totalPaise !== "number" ||
        typeof result.couponCode !== "string" && result.couponCode !== null ||
        result.paymentEnabled !== true ||
        result.orderCreated !== false
      ) {
        throw new Error("Unexpected checkout response.");
      }

      if (
        version !== reviewVersion.current ||
        reviewedItems !== JSON.stringify(items)
      ) return;

      setPreview(result as Preview);
      setReviewedCartKey(cartKey);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to review order."
      );
    } finally {
      setLoading(false);
    }
  }


  async function checkPaymentRecovery() {
    if (checkingRecovery || paying) return;

    setCheckingRecovery(true);
    setRecoveryMessage("");

    try {
      const raw = sessionStorage.getItem(pendingStorageKey);

      if (!raw) {
        throw new Error(
          "Recovery information unavailable. Contact support."
        );
      }

      const stored = JSON.parse(raw);

      if (
        !stored ||
        typeof stored.checkoutKey !== "string"
      ) {
        throw new Error("Invalid recovery information.");
      }

      const response = await fetch("/api/payments/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          checkoutKey: stored.checkoutKey,
        }),
      });

      const result = await response.json();

      if (!response.ok || result.success !== true) {
        throw new Error("Unable to confirm payment status.");
      }

      if (result.status === "PAID") {
        if (typeof result.orderNumber !== "string" || !result.orderNumber) {
          throw new Error("Payment is confirmed, but the order reference is unavailable. Contact support.");
        }

        setPaidOrder(result.orderNumber);
        clearPurchasedItems(items, buyNowOnly);
        try {
          sessionStorage.removeItem(pendingStorageKey);
        } catch {
          // The server confirmed payment; local cleanup can be retried later.
        }
        setConfirmationPending(false);
        setError("");
      } else if (result.status === "FAILED") {
        setRecoveryMessage(
          "The payment was not captured. No inventory was deducted. Contact support before retrying."
        );
      } else if (result.status === "PENDING") {
        setRecoveryMessage(
          "Payment confirmation is still pending. Do not pay again."
        );
      } else {
        setRecoveryMessage(
          "Payment requires manual review. Contact support."
        );
      }
    } catch {
      setRecoveryMessage(
        "Unable to verify payment. Do not pay again. Contact support."
      );
    } finally {
      setCheckingRecovery(false);
    }
  }

  async function paySecurely() {
    if (
      paymentLock.current ||
      confirmationPending ||
      !recoveryChecked ||
      !verifiedPreview ||
      paidOrder
    ) return;

    paymentLock.current = true;
    setPaying(true);
    setError("");

    try {
      if (!checkoutKeyRef.current) {
        checkoutKeyRef.current = crypto.randomUUID();
      }

      // Persist the attempt BEFORE contacting the payment server.
      // A lost network response must not allow a fresh checkout key.
      try {
        sessionStorage.setItem(
          pendingStorageKey,
          JSON.stringify({
            checkoutKey: checkoutKeyRef.current,
            email: customer.email,
            orderNumber: null,
          })
        );
      } catch {
        setConfirmationPending(true);
        throw new Error(
          "Secure checkout storage is unavailable. Payment was not started."
        );
      }

      setConfirmationPending(true);

      const response = await fetch("/api/payments/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          checkoutKey: checkoutKeyRef.current,
          customer,
          items,
          couponCode: verifiedPreview.couponCode,
        }),
      });

      const result = await response.json();

      if (!response.ok || result.success !== true) {
        throw new Error(result.error || "Unable to initialize payment.");
      }

      if (
        typeof result.keyId !== "string" ||
        !result.keyId.startsWith("rzp_live_") ||
        typeof result.razorpayOrderId !== "string" ||
        typeof result.orderId !== "string" ||
        typeof result.orderNumber !== "string" ||
        !Number.isSafeInteger(result.amount) ||
        result.amount !== verifiedPreview.totalPaise ||
        result.currency !== "INR"
      ) {
        throw new Error("Payment details mismatch. Please contact support.");
      }

      try {
        sessionStorage.setItem(
          pendingStorageKey,
          JSON.stringify({
            checkoutKey: checkoutKeyRef.current,
            email: customer.email,
            orderNumber: result.orderNumber,
          })
        );
      } catch {
        // Continue with in-memory protection.
      }

      setConfirmationPending(true);

      if (!window.Razorpay) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://checkout.razorpay.com/v1/checkout.js";
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Unable to load Razorpay."));
          document.body.appendChild(script);
        });
      }

      if (!window.Razorpay) {
        throw new Error("Razorpay Checkout unavailable.");
      }

      const checkout = new window.Razorpay({
        key: result.keyId,
        amount: result.amount,
        currency: "INR",
        name: "Srikalahasti Kalamkari",
        description: result.orderNumber,
        order_id: result.razorpayOrderId,
        prefill: {
          name: customer.name,
          email: customer.email,
          contact: customer.phone,
        },
        handler: async (payment: RazorpayPaymentResponse) => {
          try {
            const verifyResponse = await fetch("/api/payments/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              cache: "no-store",
              body: JSON.stringify({
                internalOrderId: result.orderId,
                razorpay_order_id: payment.razorpay_order_id,
                razorpay_payment_id: payment.razorpay_payment_id,
                razorpay_signature: payment.razorpay_signature,
              }),
            });

            const verified = await verifyResponse.json();

            if (
              !verifyResponse.ok ||
              verified.success !== true ||
              verified.status !== "PAID"
            ) {
              throw new Error(
                verified.error ||
                "Payment confirmation pending. Please contact support."
              );
            }

            setPaidOrder(result.orderNumber);
            clearPurchasedItems(items, buyNowOnly);
            try {
              sessionStorage.removeItem(pendingStorageKey);
            } catch {
              // Successful payment is already verified server-side.
            }
            setConfirmationPending(false);
          } catch (error) {
            setError(
              error instanceof Error
                ? error.message
                : "Payment confirmation pending. Please contact support."
            );
          } finally {
            paymentLock.current = false;
            setPaying(false);
          }
        },
        modal: {
          ondismiss: () => {
            paymentLock.current = false;
            setPaying(false);
          },
        },
      });

      checkout.on("payment.failed", () => {
        setError(
          "Razorpay reported that payment was not completed. Check its status before trying again."
        );
        paymentLock.current = false;
        setPaying(false);
      });

      checkout.open();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to start payment."
      );
      paymentLock.current = false;
      setPaying(false);
    }
  }

  return (
    <section className="skcheckout">
      <div className="skcheckout-heading">
        <h2>Delivery Information</h2>
        <p>Enter your details to review your order securely.</p>
      </div>

      <form onSubmit={reviewOrder} className="skcheckout-form">
        <div className="skcheckout-grid">
          <label>
            Full Name *
            <input
              required
              minLength={2}
              autoComplete="name"
              value={customer.name}
              onChange={e => update("name", e.target.value)}
              placeholder="Enter full name"
            />
          </label>

          <label>
            Mobile Number *
            <input
              required
              type="tel"
              inputMode="numeric"
              pattern="[6-9][0-9]{9}"
              maxLength={10}
              autoComplete="tel"
              value={customer.phone}
              onChange={e => update("phone", e.target.value)}
              placeholder="10-digit mobile number"
            />
          </label>

          <label className="skcheckout-wide">
            Email Address *
            <input
              required
              type="email"
              autoComplete="email"
              value={customer.email}
              onChange={e => update("email", e.target.value)}
              placeholder="example@email.com"
            />
          </label>

          <label className="skcheckout-wide">
            House Number, Street & Area *
            <textarea
              required
              minLength={10}
              rows={3}
              autoComplete="street-address"
              value={customer.address}
              onChange={e => update("address", e.target.value)}
              placeholder="Enter complete delivery address"
            />
          </label>

          <label className="skcheckout-wide">
            Landmark (Optional)
            <input
              value={customer.landmark}
              onChange={e => update("landmark", e.target.value)}
              placeholder="Nearby landmark"
            />
          </label>

          <label>
            PIN Code *
            <input
              required
              inputMode="numeric"
              pattern="[1-9][0-9]{5}"
              maxLength={6}
              autoComplete="postal-code"
              value={customer.pincode}
              onChange={e => update("pincode", e.target.value)}
              placeholder="6-digit PIN code"
            />
          </label>

          <label>
            City *
            <input
              required
              minLength={2}
              autoComplete="address-level2"
              value={customer.city}
              onChange={e => update("city", e.target.value)}
              placeholder="City"
            />
          </label>

          <label className="skcheckout-wide">
            State *
            <input
              required
              minLength={2}
              autoComplete="address-level1"
              value={customer.state}
              onChange={e => update("state", e.target.value)}
              placeholder="State"
            />
          </label>

          <label className="skcheckout-wide">
            Coupon Code (Optional)
            <input
              value={couponCode}
              onChange={e => updateCoupon(e.target.value)}
              autoCapitalize="characters"
              autoComplete="off"
              maxLength={64}
              pattern="[A-Za-z0-9_-]{3,64}"
              placeholder="Enter coupon code"
              aria-describedby="skcheckout-coupon-help"
            />
            <span id="skcheckout-coupon-help">
              Coupon eligibility and savings are verified when you review your order.
            </span>
          </label>
        </div>



        <aside className="skcheckout-right-summary">
          <div className="skcheckout-products-heading">
            <h2>Your Order</h2>
            <span>
              {displayProducts.reduce((sum, p) => sum + p.quantity, 0)} items
            </span>
          </div>

          <div className="skcheckout-products-list">
            {displayProducts.map(product => (
              <article className="skcheckout-product" key={`${product.id}:${product.variantId || "fixed"}`}>
                <div className="skcheckout-product-photo">
                  {product.image ? (
                    <img src={product.image} alt={product.name} />
                  ) : (
                    <span>Kalamkari</span>
                  )}
                </div>

                <div className="skcheckout-product-info">
                  <h3>{product.name}</h3>
                  {product.variantLabel && <p>Selected options: {product.variantLabel}</p>}
                  <p>Qty: {product.quantity}</p>
                </div>

                <strong>
                  {product.price > 0
                    ? money(product.price * product.quantity)
                    : "Price on request"}
                </strong>

                {!buyNowOnly && onRemoveProduct && (
                  <button
                    type="button"
                    className="skcheckout-product-remove"
                    aria-label={`Remove ${product.name} from order`}
                    title={
                      confirmationPending
                        ? "Payment confirmation pending"
                        : "Remove product"
                    }
                    disabled={confirmationPending || paying || loading}
                    onClick={() => {
                      reviewVersion.current += 1;
                      setPreview(null);
                      setError("");
                    onRemoveProduct(product.id, product.variantId);
                    }}
                  >
                    ×
                  </button>
                )}
              </article>
            ))}
          </div>
        <div className="skcheckout-total">
          <h3 className="skcheckout-total-heading">Order Total</h3>
          <div>
            <span>Product Subtotal</span>
            <strong>
              {money(
                verifiedPreview
                  ? verifiedPreview.subtotalPaise / 100
                  : subtotal
              )}
            </strong>
          </div>

          <div>
            <span>Shipping Charges</span>
            <strong className="skcheckout-free">FREE</strong>
          </div>

          {verifiedPreview && verifiedPreview.discountPaise > 0 && (
            <div>
              <span>Coupon Discount ({verifiedPreview.couponCode})</span>
              <strong className="skcheckout-free">
                −{money(verifiedPreview.discountPaise / 100)}
              </strong>
            </div>
          )}

          <div className="skcheckout-grand">
            <span>
              {verifiedPreview
                ? "Verified Order Total"
                : "Estimated Order Total"}
            </span>
            <strong>
              {money(
                verifiedPreview
                  ? verifiedPreview.totalPaise / 100
                  : subtotal
              )}
            </strong>
          </div>
        </div>

          <div className="skcheckout-payment-actions">
        <button
          type="submit"
          className="skcheckout-submit"
          disabled={loading || paying || confirmationPending || !!paidOrder || checkoutBlocked}
        >
          {loading ? "Verifying Order..." : "Review Order"}
        </button>

        {verifiedPreview && !paidOrder && !confirmationPending && (
          <button
            type="button"
            className="skcheckout-submit"
            onClick={paySecurely}
            disabled={paying || loading}
          >
            {paying ? "Processing Payment..." : "Pay Securely"}
          </button>
        )}

        {confirmationPending && !paidOrder && (
          <div role="status" className="skcheckout-error">
            <p>
              Payment status needs confirmation. Do not pay again.
            </p>
            <button
              type="button"
              onClick={checkPaymentRecovery}
              disabled={checkingRecovery || paying}
            >
              {checkingRecovery
                ? "Checking Payment..."
                : "Check Payment Status"}
            </button>
            {recoveryMessage && <p>{recoveryMessage}</p>}
          </div>
        )}

        {paidOrder && (
          <p className="skcheckout-success" role="status">
            Payment verified successfully. Order: {paidOrder}
          </p>
        )}

        {verifiedPreview && !paidOrder && (
          <p className="skcheckout-success" role="status">
            Order details verified with the server.
            Free shipping applied. No payment has been made yet.
          </p>
        )}

        {error && (
          <p className="skcheckout-error" role="alert">
            {error}
          </p>
        )}

          </div>
        <p className="skcheckout-secure">
          Free shipping on all orders. Payments are processed securely
          through Razorpay. Review your order before paying.
        </p>
        </aside>


      </form>
    </section>
  );
}
