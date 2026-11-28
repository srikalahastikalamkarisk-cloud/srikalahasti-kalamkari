"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { Truck } from "lucide-react";

type Status = "PENDING" | "PROCESSING" | "SHIPPED" | "DELIVERED";

type Props = {
  orderId: string;
  orderStatus: string;
  paymentStatus: string;
  inventoryStatus: string;
  courierName: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
};

const nextStatus: Record<string, Status> = {
  PENDING: "PROCESSING",
  PROCESSING: "SHIPPED",
  SHIPPED: "DELIVERED",
};

function formatDate(value: string | null) {
  if (!value) return "Not yet";

  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });
}

export default function OrderFulfilmentPanel(props: Props) {
  const router = useRouter();

  const status = nextStatus[props.orderStatus] ?? "";
  const [refreshing, startTransition] = useTransition();
  const requestLock = useRef(false);
  const [submittedFrom, setSubmittedFrom] = useState<string | null>(null);
  const awaitingUpdate = submittedFrom === props.orderStatus;

  const [courierName, setCourierName] = useState(
    props.courierName ?? ""
  );

  const [trackingNumber, setTrackingNumber] = useState(
    props.trackingNumber ?? ""
  );

  const [trackingUrl, setTrackingUrl] = useState(
    props.trackingUrl ?? ""
  );

  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const ready =
    props.paymentStatus === "PAID" &&
    props.inventoryStatus === "DEDUCTED";

  const next = nextStatus[props.orderStatus];

  const canSubmit =
    ready &&
    Boolean(next) &&
    status === next &&
    !saving &&
    !refreshing &&
    !awaitingUpdate &&
    !cancelling &&
    (status !== "SHIPPED" ||
      (courierName.trim().length > 0 &&
        trackingNumber.trim().length > 0));

  async function save() {
    if (!canSubmit || requestLock.current) return;

    requestLock.current = true;
    setSaving(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch(
        `/api/admin/orders/${encodeURIComponent(props.orderId)}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status,
            ...(status === "SHIPPED"
              ? {
                  courierName: courierName.trim(),
                  trackingNumber: trackingNumber.trim(),
                  trackingUrl: trackingUrl.trim(),
                }
              : {}),
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "Unable to update order"
        );
      }

      setSubmittedFrom(props.orderStatus);
      setMessage("Order status updated successfully.");
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to update order"
      );
    } finally {
      requestLock.current = false;
      setSaving(false);
    }
  }

  async function cancelOrder() {
    if (saving || cancelling || cancelled) return;
    if (!window.confirm(
      "Cancel this unpaid order? Razorpay will be checked for payment activity. Only verified unpaid orders with no payments or exclusively failed payments are eligible. Active, successful or unknown payments block cancellation. A payment captured but not yet visible to Razorpay's payment listing may still require manual review. The order history will be preserved. This action cannot be undone."
    )) return;

    setCancelling(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch(
        `/api/admin/orders/${encodeURIComponent(props.orderId)}/cancel`,
        { method: "POST" }
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Unable to cancel order");
      }
      setCancelled(true);
      setMessage("Order cancelled. The record remains in order history.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancellation failed");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <section className="skorders-panel skorder-section">
      <div className="skorders-panel-heading">
        <h2>
          <Truck size={19} />
          Order Fulfilment
        </h2>
      </div>

      <div className="skorder-fulfilment">
        <div className="skorder-fulfilment-current">
          <span>Current Status</span>
          <strong>{props.orderStatus}</strong>
        </div>

        <div className="skorder-fulfilment-current">
          <span>Inventory Status</span>
          <strong>{props.inventoryStatus}</strong>
        </div>

        {!ready && (
          <p className="skorder-fulfilment-warning">
            Status updates require confirmed payment and
            successfully deducted inventory.
          </p>
        )}

        {next ? (
          <>
            <label className="skorder-fulfilment-field">
              <span>Next Order Status</span>
              <select
                value={status}
                disabled
              >
                <option value={next}>{next}</option>
              </select>
            </label>

            {status === "SHIPPED" && (
              <>
                <label className="skorder-fulfilment-field">
                  <span>Courier Name *</span>
                  <input
                    value={courierName}
                    onChange={event =>
                      setCourierName(event.target.value)
                    }
                    placeholder="Example: Blue Dart"
                    maxLength={191}
                    disabled={!ready || saving}
                  />
                </label>

                <label className="skorder-fulfilment-field">
                  <span>Tracking Number *</span>
                  <input
                    value={trackingNumber}
                    onChange={event =>
                      setTrackingNumber(event.target.value)
                    }
                    placeholder="Enter tracking number"
                    maxLength={191}
                    disabled={!ready || saving}
                  />
                </label>

                <label className="skorder-fulfilment-field">
                  <span>Tracking URL (Optional)</span>
                  <input
                    type="url"
                    value={trackingUrl}
                    onChange={event =>
                      setTrackingUrl(event.target.value)
                    }
                    placeholder="https://..."
                    maxLength={500}
                    disabled={!ready || saving}
                  />
                </label>
              </>
            )}

            <button
              type="button"
              className="skorder-fulfilment-save"
              disabled={!canSubmit}
              onClick={save}
            >
              {saving
                ? "Saving..."
                : refreshing || awaitingUpdate
                  ? "Updating order..."
                  : `Mark as ${next}`}
            </button>

            {awaitingUpdate && !refreshing && !saving && (
              <button
                type="button"
                className="skorder-fulfilment-save"
                onClick={() => startTransition(() => router.refresh())}
              >
                Refresh order details
              </button>
            )}
          </>
        ) : (
          <p className="skorder-fulfilment-complete">
            No further fulfilment action available.
          </p>
        )}

        {props.orderStatus === "PENDING" &&
          props.paymentStatus === "UNPAID" &&
          props.inventoryStatus === "PENDING" &&
          !cancelled && (
          <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--skad-border)" }}>
            <p style={{ marginBottom: 10 }}>
              Unpaid order? Cancellation requires a fresh Razorpay LIVE check. Failed payment attempts may be cancelled after verification. Active, successful or uncertain payments require manual review.
            </p>
            <button
              type="button"
              onClick={cancelOrder}
              disabled={saving || cancelling}
              style={{
                padding: "11px 18px",
                borderRadius: 8,
                border: "1px solid var(--skad-error)",
                color: "var(--skad-error)",
                background: "transparent",
                cursor: cancelling ? "wait" : "pointer",
                fontWeight: 700
              }}
            >
              {cancelling ? "Verifying payment..." : "Cancel Order"}
            </button>
          </div>
        )}

        {(props.courierName || props.trackingNumber) && (
          <div className="skorder-fulfilment-tracking">
            <strong>Shipment Information</strong>
            {props.courierName && <p>Courier: {props.courierName}</p>}
            {props.trackingNumber && (
              <p>Tracking: {props.trackingNumber}</p>
            )}
            {props.trackingUrl?.startsWith("https://") && (
              <a
                href={props.trackingUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Track Shipment
              </a>
            )}
          </div>
        )}

        <div className="skorder-fulfilment-dates">
          <p>Shipped: {formatDate(props.shippedAt)}</p>
          <p>Delivered: {formatDate(props.deliveredAt)}</p>
        </div>

        {message && (
          <p role="status" className="skorder-fulfilment-success">
            {message}
          </p>
        )}

        {error && (
          <p role="alert" className="skorder-fulfilment-error">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
