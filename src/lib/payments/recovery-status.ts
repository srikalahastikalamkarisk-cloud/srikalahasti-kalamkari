export type RecoveryOrder = {
  orderNumber?: string;
  paymentStatus: string;
  orderStatus?: string;
  paymentAttempts: Array<{ status: string }>;
} | null;

export function recoveryStatusFromOrder(order: RecoveryOrder, retryAllowed = false) {
  if (!order) {
    return {
      success: true,
      status: "REVIEW_REQUIRED",
      retryAllowed: false,
    };
  }

  if (order.paymentStatus === "PAID") {
    return {
      success: true,
      status: "PAID",
      retryAllowed: false,
      ...(order.orderNumber ? { orderNumber: order.orderNumber } : {}),
    };
  }

  if (order.orderStatus === "CANCELLED") {
    return {
      success: true,
      status: "CANCELLED",
      retryAllowed: false,
      ...(order.orderNumber ? { orderNumber: order.orderNumber } : {}),
    };
  }

  if (order.paymentAttempts[0]?.status === "FAILED") {
    return {
      success: true,
      status: "FAILED",
      retryAllowed,
    };
  }

  return {
    success: true,
    status: order.paymentAttempts.length
      ? "PENDING"
      : "REVIEW_REQUIRED",
    retryAllowed: false,
  };
}
