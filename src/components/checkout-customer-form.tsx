"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
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
  const [accountState, setAccountState] = useState<"loading" | "guest" | "verified" | "unverified">("loading");
  const router = useRouter();
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
  const legacyStorageKey = "sk-pending-live-checkout-v1";
  const [accountEmail, setAccountEmail] = useState("");
  const checkoutIdentity = JSON.stringify({
    mode: buyNowOnly ? "buy-now" : "cart",
    email: accountEmail.trim().toLowerCase(),
    items: items.map(item => ({
      productId: String(item.productId),
      variantId: item.variantId || "",
      quantity: item.quantity
    })).sort((a, b) =>
      JSON.stringify(a).localeCompare(JSON.stringify(b))
    )
  });
  const scopedStorageKey =
    "sk-pending-live-checkout-v2:" +
    encodeURIComponent(checkoutIdentity);
  const [legacyRecovery, setLegacyRecovery] = useState(false);
  const pendingStorageKey = legacyRecovery
    ? legacyStorageKey
    : scopedStorageKey;
  const [recoveryChecked, setRecoveryChecked] = useState(false);

  useEffect(() => {
    fetch("/api/customer/me", { cache: "no-store" }).then(async response => {
      const data = await response.json();
      if (response.ok && data.customer) {
        setCustomer(current => ({ ...current, name: data.customer.name || "", email: data.customer.email || "", phone: data.customer.phone || "" }));
        setAccountEmail(data.customer.email || "");
        setAccountState(data.customer.mobileVerifiedAt || data.customer.emailVerifiedAt ? "verified" : "unverified");
      } else setAccountState("guest");
    }).catch(() => setAccountState("guest"));
  }, []);

  useEffect(() => {
    if (accountState !== "verified" || !accountEmail) return;

    checkoutKeyRef.current = "";
    setPreview(null);
    setReviewedCartKey("");
    setPaidOrder("");
    setRecoveryMessage("");
    setRecoveryChecked(false);

    try {
      const scoped = sessionStorage.getItem(scopedStorageKey);
      const legacy = sessionStorage.getItem(legacyStorageKey);

      setLegacyRecovery(!scoped && Boolean(legacy));
      setConfirmationPending(Boolean(scoped || legacy));
      setRecoveryChecked(true);
    } catch {
      setConfirmationPending(true);
    }
  }, [accountState, accountEmail, scopedStorageKey]);




  const cartKey = JSON.stringify(items);
  const [reviewedCartKey, setReviewedCartKey] = useState("");

  const verifiedPreview =
    reviewedCartKey === cartKey && recoveryChecked
      ? preview
      : null;

  function update(field: keyof Customer, value: string) {
    reviewVersion.current += 1;
    setCustomer(previous => ({ ...previous, [field]: value }));
    if (field === "email") setAccountEmail(value);
    setPreview(null);
    setError("");
  }

  function updateCoupon(value: string) {
    reviewVersion.current += 1;
    setCouponCode(value.toUpperCase());
    setPreview(null);
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

        if (response.status === 401) { router.push(`/login?returnTo=${encodeURIComponent(
      buyNowOnly ? "/checkout?buyNow=1" : "/checkout"
    )}`); return; }
        if (response.status === 403 && result.verificationRequired === true) { router.push(`/resend-verification?returnTo=${encodeURIComponent(buyNowOnly ? "/checkout?buyNow=1" : "/checkout")}`); return; }
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


  function clearResolvedRecovery(
    resolvedCheckoutKey: string
  ) {
    if (!resolvedCheckoutKey) return;

    const keys = Array.from(
      { length: sessionStorage.length },
      (_, index) => sessionStorage.key(index)
    );

    for (const key of keys) {
      if (!key) continue;

      if (
        key !== "sk-pending-live-checkout-v1" &&
        !key.startsWith("sk-pending-live-checkout-v2:")
      ) continue;

      try {
        const raw = sessionStorage.getItem(key);
        if (!raw) continue;

        const record = JSON.parse(raw);

        if (record.checkoutKey === resolvedCheckoutKey) {
          sessionStorage.removeItem(key);
        }
      } catch {
        // Preserve unreadable or unrelated recovery records.
      }
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

      if (result.status === "ORDER_NOT_FOUND") {
        const sameAccount =
          typeof stored.email === "string" &&
          stored.email.trim().toLowerCase() ===
            accountEmail.trim().toLowerCase();

        // Never discard an uncertain provider payment.
        // Only resume a scoped checkout that has no
        // recorded server order reference.
        if (
          !sameAccount ||
          stored.orderNumber !== null ||
          !/^[A-Za-z0-9_-]{32,128}$/.test(stored.checkoutKey)
        ) {
          setRecoveryMessage(
            "An earlier payment requires confirmation. " +
            "Please contact support before paying again."
          );
          return;
        }

        if (legacyRecovery) {
          const existing = sessionStorage.getItem(scopedStorageKey);

          if (
            existing &&
            JSON.parse(existing).checkoutKey !== stored.checkoutKey
          ) {
            setRecoveryMessage(
              "Multiple checkout records require confirmation."
            );
            return;
          }

          const archiveKey =
            "sk-archived-live-checkout-v1:" +
            encodeURIComponent(stored.checkoutKey);

          // Preserve the original record before migration.
          sessionStorage.setItem(archiveKey, raw);
          sessionStorage.setItem(scopedStorageKey, raw);
          sessionStorage.removeItem(legacyStorageKey);

          setLegacyRecovery(false);
        }

        // Reuse the original idempotency key.
        // Do not generate a fresh payment identity.
        checkoutKeyRef.current = stored.checkoutKey;

        setConfirmationPending(false);
        setPreview(null);
        setReviewedCartKey("");
        setError("");
        setRecoveryMessage(
          "Your checkout can be resumed securely. " +
          "Please review your order again."
        );
        return;
      }

      const normalizeRecoveryItems = (
        lines: Array<{
          productId: string;
          variantId?: string | null;
          quantity: number;
        }>
      ) => JSON.stringify(
        lines.map(line => ({
          productId: String(line.productId),
          variantId: line.variantId || "",
          quantity: line.quantity,
        })).sort((a, b) =>
          JSON.stringify(a).localeCompare(JSON.stringify(b))
        )
      );

      if (legacyRecovery) {
        if (
          !Array.isArray(result.items) ||
          result.items.length === 0 ||
          !result.items.every((line: {
            productId?: unknown;
            quantity?: unknown;
          }) =>
            line &&
            typeof line.productId === "string" &&
            typeof line.quantity === "number" &&
            Number.isSafeInteger(line.quantity) &&
            line.quantity > 0
          )
        ) {
          setRecoveryMessage(
            "The earlier payment requires confirmation before continuing."
          );
          return;
        }

        const sameProducts =
          normalizeRecoveryItems(result.items) ===
          normalizeRecoveryItems(items);

        if (!sameProducts) {
          const originalItems = JSON.parse(
            normalizeRecoveryItems(result.items)
          );

          // Legacy checkout mode is unknown.
          // Preserve the original payment in both possible scopes.
          const keys = ["buy-now", "cart"].map(mode =>
            "sk-pending-live-checkout-v2:" +
            encodeURIComponent(JSON.stringify({
              mode,
              email: accountEmail.trim().toLowerCase(),
              items: originalItems
            }))
          );

          for (const key of keys) {
            const existing = sessionStorage.getItem(key);
            if (
              existing &&
              JSON.parse(existing).checkoutKey !== stored.checkoutKey
            ) {
              setRecoveryMessage(
                "Multiple earlier payments require confirmation."
              );
              return;
            }
          }

          const archiveKey =
            "sk-archived-live-checkout-v1:" +
            encodeURIComponent(stored.checkoutKey);

          sessionStorage.setItem(archiveKey, raw);

          for (const key of keys) {
            sessionStorage.setItem(key, raw);
          }

          sessionStorage.removeItem(legacyStorageKey);
          checkoutKeyRef.current = "";
          setLegacyRecovery(false);
          setConfirmationPending(false);
          setPreview(null);
          setReviewedCartKey("");
          setError("");
          setRecoveryMessage("");
          return;
        }
      }

      if (result.status === "PAID") {
        if (typeof result.orderNumber !== "string" || !result.orderNumber) {
          throw new Error("Payment is confirmed, but the order reference is unavailable. Contact support.");
        }

        setPaidOrder(result.orderNumber);
        if (!legacyRecovery) {
          clearPurchasedItems(items, buyNowOnly);
        }
        try {
          clearResolvedRecovery(stored.checkoutKey);
        } catch {
          // The server confirmed payment; local cleanup can be retried later.
        }
        setConfirmationPending(false);
        router.replace(
          `/checkout/success?order=${encodeURIComponent(result.orderNumber)}`
        );

        setError("");
      } else if (result.status === "CANCELLED") {
        clearResolvedRecovery(stored.checkoutKey);
        setLegacyRecovery(false);
        checkoutKeyRef.current = "";
        setConfirmationPending(false);
        setPreview(null);
        setReviewedCartKey("");
        setError("");
        setRecoveryMessage("");
      } else if ((result.status === "FAILED" || result.status === "INTERRUPTED") && result.retryAllowed === true) {
        if (legacyRecovery) {
          setRecoveryMessage(
            "An earlier checkout is unpaid. Please resolve that order before continuing."
          );
          return;
        }
        checkoutKeyRef.current = stored.checkoutKey;
        setConfirmationPending(false);
        setRecoveryMessage("The existing Razorpay order is confirmed unpaid. Review your order and retry securely.");
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
        "We could not confirm your payment yet. Please check again shortly or contact support before retrying."
      );
    } finally {
      setCheckingRecovery(false);
    }
  }

  useEffect(() => {
    if (
      accountState !== "verified" ||
      !recoveryChecked ||
      !confirmationPending ||
      paying ||
      paidOrder
    ) return;

    const timer = window.setTimeout(() => {
      void checkPaymentRecovery();
    }, 800);

    return () => window.clearTimeout(timer);
  }, [
    accountState,
    recoveryChecked,
    confirmationPending,
    paying,
    paidOrder
  ]);

  async function paySecurely() {
    if (
      paymentLock.current ||
      confirmationPending ||
      !recoveryChecked ||
      legacyRecovery ||
      !accountEmail ||
      !verifiedPreview ||
      paidOrder
    ) return;

    paymentLock.current = true;
    let activeCheckoutKey = "";
    setPaying(true);
    setError("");

    try {
      if (!checkoutKeyRef.current) {
        checkoutKeyRef.current = crypto.randomUUID();
      }
      activeCheckoutKey = checkoutKeyRef.current;

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
              clearResolvedRecovery(activeCheckoutKey);
            } catch {
              // Successful payment is already verified server-side.
            }
            setConfirmationPending(false);
        router.replace(
          `/checkout/success?order=${encodeURIComponent(result.orderNumber)}`
        );

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
          "Payment was not completed. We are checking its status before allowing a secure retry."
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

  if (paidOrder && accountState === "verified") {
    return (
      <section className="skcheckout">
        <div className="skoc" role="status">
          <div className="skoc-card">

            <div className="skoc-icon" aria-hidden="true">
              <svg width="42" height="42"
                viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="1.8"
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
                <strong>{paidOrder}</strong>
              </div>

              <div>
                <span>Payment Status</span>
                <strong className="skoc-paid">
                  Paid Successfully
                </strong>
              </div>

              <div>
                <span>Payment Gateway</span>
                <strong>Razorpay</strong>
              </div>
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
              <a href="/account" className="skoc-primary">
                View My Orders
                <span aria-hidden="true">→</span>
              </a>

              <a href="/shop" className="skoc-secondary">
                Continue Shopping
              </a>
            </div>

            <p className="skoc-secure">
              Secure payment powered by Razorpay
            </p>

          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="skcheckout">
      {accountState === "loading" ? (
        <div className="skca-loading" role="status">
          <span className="skca-spinner" />
          Checking your account…
        </div>
      ) : accountState !== "verified" ? (
        <div className="skca">
          <div className="skca-intro">
            <span className="skca-eyebrow">
              SECURE CHECKOUT
            </span>
            <h2>Your selection awaits</h2>
            <p>One step closer to owning something handcrafted.</p>
          </div>

          <div className="skca-grid">
            <div className="skca-card">
              <div className="skca-icon" aria-hidden="true">
                <svg width="29" height="29" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="8" r="3.5"/>
                  <path d="M4 21v-2a8 8 0 0 1 16 0v2"/>
                </svg>
              </div>

              <h3>{accountState === "unverified"
                ? "Verify your email"
                : "Welcome back"}</h3>

              <p className="skca-description">
                {accountState === "unverified"
                  ? "Verify your email address to continue securely."
                  : "Sign in to continue with your selected products and complete your purchase."}
              </p>

              <div className="skca-actions">
                {accountState === "unverified" ? (
                  <a className="skca-primary"
                    href={`/resend-verification?returnTo=${encodeURIComponent(buyNowOnly ? "/checkout?buyNow=1" : "/checkout")}`}>
                    Resend Verification Email
                  </a>
                ) : (
                  <>
                    <a className="skca-primary"
                      href={`/login?returnTo=${encodeURIComponent(buyNowOnly ? "/checkout?buyNow=1" : "/checkout")}`}>
                      Sign In &amp; Continue
                      <span aria-hidden="true">→</span>
                    </a>

                    <div className="skca-or">
                      <span>New to Srikalahasti Kalamkari?</span>
                    </div>

                    <a className="skca-secondary"
                      href={`/register?returnTo=${encodeURIComponent(buyNowOnly ? "/checkout?buyNow=1" : "/checkout")}`}>
                      Create New Account
                    </a>
                  </>
                )}
              </div>

              <div className="skca-trust">
                <svg width="18" height="18" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="1.6"
                  aria-hidden="true">
                  <path d="M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/>
                  <path d="m8 12 3 3 5-6"/>
                </svg>
                Secure login · Protected payments
              </div>
            </div>

            <aside className="skca-card skca-summary">
              <div className="skca-summary-heading">
                <h3>Your selection</h3>
                <span>{items.reduce((sum, item) =>
                  sum + item.quantity, 0)} item(s)</span>
              </div>

              <div className="skca-products">
                {displayProducts.map(product => (
                  <div className="skca-product"
                    key={`${product.id}:${product.variantId || ""}`}>
                    {product.image ? (
                      <img src={product.image}
                        alt={product.name} loading="lazy"/>
                    ) : (
                      <div className="skca-placeholder">Kalamkari</div>
                    )}

                    <div className="skca-product-info">
                      <strong>{product.name}</strong>
                      {product.variantLabel && (
                        <span>{product.variantLabel}</span>
                      )}
                      <span>Qty: {product.quantity}</span>
                      <b>{money(product.price * product.quantity)}</b>
                    </div>
                  </div>
                ))}
              </div>

              <div className="skca-total">
                <span>Estimated subtotal</span>
                <strong>{money(subtotal)}</strong>
              </div>

              <div className="skca-saved">
                <span aria-hidden="true">✓</span>
                <div>
                  <strong>Your selection is saved</strong>
                  <p>Continue with the same selection after signing in on this tab.</p>
                </div>
              </div>
            </aside>
          </div>
        </div>
      ) : <>
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
              We are confirming your previous payment. Please wait before retrying.
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
      </>}
    </section>
  );
}
