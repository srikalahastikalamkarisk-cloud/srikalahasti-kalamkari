import "server-only";

import { prisma } from "@/lib/prisma";
import { reconcilePaidInventory } from "@/lib/payments/reconcile-paid-inventory";
import { reconcileCouponRedemption } from "./reconcile-coupon-redemption";

type ProviderOrder = {
  id: string;
  status: string;
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  attempts: number;
};

type ProviderPayment = {
  id: string;
  order_id: string;
  status: string;
  captured: boolean;
  amount: number;
  currency: string;
};

export type CouponPaymentReader = {
  fetchOrder(orderId: string): Promise<ProviderOrder>;
  fetchPayments(orderId: string): Promise<ProviderPayment[]>;
  /** Must only be provided by a provider adapter with a documented,
   * irrevocable terminal order state. Standard Razorpay Orders states have none. */
  isDefinitivelyTerminal?: (
    order: ProviderOrder,
    payments: ProviderPayment[]
  ) => boolean;
};

export type CouponReservationReconcileStatus =
  | "RESERVED"
  | "REDEEMED"
  | "RELEASED"
  | "NEEDS_REVIEW";

export type CouponReservationReconcileResult = {
  orderId: string;
  status: CouponReservationReconcileStatus;
  action: "NO_CHANGE" | "WOULD_REDEEM" | "WOULD_RELEASE" | "REDEEMED" | "RELEASED";
  reason?: string;
  inventoryStatus?: string;
};

const FAILED_PAYMENT_STATES = new Set(["failed"]);
const UNCERTAIN_PAYMENT_STATES = new Set(["created", "authorized"]);

function needsReview(orderId: string, reason: string): CouponReservationReconcileResult {
  return {
    orderId,
    status: "NEEDS_REVIEW",
    action: "NO_CHANGE",
    reason,
  };
}

async function setReservationForReview(orderId: string) {
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM \`Order\` WHERE id = ${orderId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM CouponReservation WHERE orderId = ${orderId} FOR UPDATE`;
    await tx.couponReservation.updateMany({
      where: { orderId, status: { in: ["RESERVED", "REVIEW_REQUIRED"] } },
      data: { status: "REVIEW_REQUIRED" },
    });
  }, { isolationLevel: "ReadCommitted", maxWait: 10000, timeout: 20000 });
}

async function markCapturedPayment(
  orderId: string,
  remoteOrder: ProviderOrder,
  captured: ProviderPayment
): Promise<boolean> {
  return prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM \`Order\` WHERE id = ${orderId} FOR UPDATE
    `;
    if (rows.length !== 1) return false;

    await tx.$queryRaw`
      SELECT id FROM CouponReservation WHERE orderId = ${orderId} FOR UPDATE
    `;

    const order = await tx.order.findUnique({ where: { id: orderId } });
    const attempt = await tx.paymentAttempt.findFirst({
      where: { orderId, razorpayOrderId: remoteOrder.id },
      orderBy: { createdAt: "desc" },
    });

    if (
      !order ||
      !attempt ||
      order.razorpayOrderId !== remoteOrder.id ||
      remoteOrder.amount !== attempt.amountPaise ||
      Math.round(Number(order.totalAmount) * 100) !== attempt.amountPaise ||
      captured.order_id !== remoteOrder.id ||
      captured.amount !== attempt.amountPaise ||
      captured.currency !== attempt.currency ||
      captured.status !== "captured" ||
      captured.captured !== true
    ) {
      return false;
    }

    if (order.paymentStatus === "PAID") {
      return order.paymentId === captured.id &&
        attempt.razorpayPaymentId === captured.id &&
        attempt.status === "CAPTURED";
    }

    if (
      (order.paymentId && order.paymentId !== captured.id) ||
      (attempt.razorpayPaymentId && attempt.razorpayPaymentId !== captured.id)
    ) {
      return false;
    }

    await tx.paymentAttempt.update({
      where: { id: attempt.id },
      data: { razorpayPaymentId: captured.id, status: "CAPTURED" },
    });
    await tx.order.update({
      where: { id: orderId },
      data: {
        paymentId: captured.id,
        paymentStatus: "PAID",
        paidAt: order.paidAt ?? new Date(),
        ...(order.orderStatus === "CANCELLED"
          ? { inventoryStatus: "REVIEW_REQUIRED" }
          : {}),
      },
    });
    return true;
  }, { isolationLevel: "ReadCommitted", maxWait: 10000, timeout: 20000 });
}

async function releaseTerminalReservation(
  orderId: string
): Promise<"RELEASED" | "ALREADY_RELEASED" | "NOT_RELEASED"> {
  return prisma.$transaction(async tx => {
    const orderRows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM \`Order\` WHERE id = ${orderId} FOR UPDATE
    `;
    if (orderRows.length !== 1) return "NOT_RELEASED" as const;

    const reservationRows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM CouponReservation WHERE orderId = ${orderId} FOR UPDATE
    `;
    if (reservationRows.length !== 1) return "NOT_RELEASED" as const;

    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { paymentStatus: true },
    });
    const attempt = await tx.paymentAttempt.findFirst({
      where: { orderId },
      orderBy: { createdAt: "desc" },
    });
    const reservation = await tx.couponReservation.findUnique({ where: { orderId } });

    if (reservation?.status === "RELEASED") return "ALREADY_RELEASED" as const;

    if (
      !order ||
      !reservation ||
      !["RESERVED", "REVIEW_REQUIRED"].includes(reservation.status) ||
      order.paymentStatus === "PAID" ||
      attempt?.status === "CAPTURED" ||
      attempt?.razorpayPaymentId
    ) {
      return "NOT_RELEASED" as const;
    }

    const result = await tx.couponReservation.updateMany({
      where: {
        id: reservation.id,
        status: { in: ["RESERVED", "REVIEW_REQUIRED"] },
      },
      data: { status: "RELEASED", finalizedAt: new Date() },
    });
    return result.count === 1 ? "RELEASED" as const : "NOT_RELEASED" as const;
  }, { isolationLevel: "ReadCommitted", maxWait: 10000, timeout: 20000 });
}

/**
 * Reconcile one reservation using read-only authoritative provider endpoints.
 * Razorpay's documented Orders API currently exposes created/attempted/paid;
 * only an explicit terminal state can release a reservation. Failed payment
 * attempts alone never qualify because the order can accept another attempt.
 */
export async function reconcileCouponReservation(input: {
  orderId: string;
  dryRun?: boolean;
  now?: Date;
  provider: CouponPaymentReader;
}): Promise<CouponReservationReconcileResult> {
  const dryRun = input.dryRun ?? true;
  const now = input.now ?? new Date();
  const reservation = await prisma.couponReservation.findUnique({
    where: { orderId: input.orderId },
  });

  if (!reservation) return needsReview(input.orderId, "Coupon reservation not found.");
  if (reservation.status === "RELEASED") {
    return { orderId: input.orderId, status: "RELEASED", action: "NO_CHANGE" };
  }
  if (reservation.status === "REDEEMED") {
    return { orderId: input.orderId, status: "REDEEMED", action: "NO_CHANGE" };
  }
  if (!["RESERVED", "REVIEW_REQUIRED"].includes(reservation.status)) {
    return needsReview(input.orderId, "Reservation status is not reconcilable.");
  }

  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    select: {
      orderStatus: true,
      paymentStatus: true,
      paymentId: true,
      razorpayOrderId: true,
      totalAmount: true,
      paymentAttempts: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { status: true, razorpayOrderId: true, razorpayPaymentId: true, amountPaise: true, currency: true },
      },
    },
  });
  const attempt = order?.paymentAttempts[0];

  if (!order || !order.razorpayOrderId || !attempt || attempt.razorpayOrderId !== order.razorpayOrderId) {
    if (!dryRun) await setReservationForReview(input.orderId);
    return needsReview(input.orderId, "Local payment attempt is incomplete.");
  }

  // A prior verified callback may have committed payment but failed during
  // coupon/inventory reconciliation. Recover from local captured evidence.
  if (order.paymentStatus === "PAID" && order.paymentId && attempt.status === "CAPTURED" && attempt.razorpayPaymentId === order.paymentId) {
    if (order.orderStatus === "CANCELLED") {
      if (!dryRun) await setReservationForReview(input.orderId);
      return needsReview(input.orderId, "Cancelled paid order requires manual reconciliation.");
    }
    if (dryRun) {
      return { orderId: input.orderId, status: "REDEEMED", action: "WOULD_REDEEM" };
    }
    const coupon = await reconcileCouponRedemption(input.orderId);
    const inventoryStatus = await reconcilePaidInventory(input.orderId);
    if (coupon === "REDEEMED" || coupon === "ALREADY_REDEEMED" || coupon === "NOT_APPLICABLE") {
      return { orderId: input.orderId, status: "REDEEMED", action: dryRun ? "WOULD_REDEEM" : "REDEEMED", inventoryStatus };
    }
    return { ...needsReview(input.orderId, "Payment is paid but coupon redemption needs review."), inventoryStatus };
  }

  let remoteOrder: ProviderOrder;
  let payments: ProviderPayment[];
  try {
    [remoteOrder, payments] = await Promise.all([
      input.provider.fetchOrder(order.razorpayOrderId),
      input.provider.fetchPayments(order.razorpayOrderId),
    ]);
  } catch {
    if (!dryRun) await setReservationForReview(input.orderId);
    return needsReview(input.orderId, "Razorpay state could not be verified.");
  }

  if (
    remoteOrder.id !== order.razorpayOrderId ||
    remoteOrder.amount !== attempt.amountPaise ||
    remoteOrder.currency !== attempt.currency ||
    Math.round(Number(order.totalAmount) * 100) !== attempt.amountPaise ||
    payments.some(payment => payment.order_id !== remoteOrder.id)
  ) {
    if (!dryRun) await setReservationForReview(input.orderId);
    return needsReview(input.orderId, "Razorpay order details do not match this checkout.");
  }

  const capturedPayments = payments.filter(payment =>
    payment.status === "captured" && payment.captured === true
  );
  if (remoteOrder.status === "paid" || remoteOrder.amount_paid > 0 || capturedPayments.length > 0) {
    const matching = capturedPayments.filter(payment =>
      payment.amount === attempt.amountPaise && payment.currency === attempt.currency
    );
    if (matching.length !== 1 || remoteOrder.amount_paid !== attempt.amountPaise) {
      if (!dryRun) await setReservationForReview(input.orderId);
      return needsReview(input.orderId, "Captured provider payment is missing or inconsistent.");
    }

    if (dryRun) {
      return { orderId: input.orderId, status: "REDEEMED", action: "WOULD_REDEEM" };
    }

    const recorded = await markCapturedPayment(input.orderId, remoteOrder, matching[0]);
    if (!recorded) {
      await setReservationForReview(input.orderId);
      return needsReview(input.orderId, "Captured payment conflicts with local order state.");
    }
    const latestOrder = await prisma.order.findUnique({
      where: { id: input.orderId },
      select: { orderStatus: true },
    });

    if (!latestOrder || latestOrder.orderStatus === "CANCELLED") {
      await setReservationForReview(input.orderId);
      return needsReview(input.orderId, "Cancelled order payment recorded; manual reconciliation required.");
    }

    const coupon = await reconcileCouponRedemption(input.orderId);
    const inventoryStatus = await reconcilePaidInventory(input.orderId);
    if (coupon === "REDEEMED" || coupon === "ALREADY_REDEEMED" || coupon === "NOT_APPLICABLE") {
      return { orderId: input.orderId, status: "REDEEMED", action: "REDEEMED", inventoryStatus };
    }
    return { ...needsReview(input.orderId, "Captured payment recorded; coupon redemption requires review."), inventoryStatus };
  }

  const hasUnsettledPayment = payments.some(payment =>
    UNCERTAIN_PAYMENT_STATES.has(payment.status)
  );
  const allAttemptsFailed = payments.every(payment => FAILED_PAYMENT_STATES.has(payment.status));
  const explicitlyTerminal = input.provider.isDefinitivelyTerminal?.(remoteOrder, payments) === true &&
    remoteOrder.amount_paid === 0 &&
    !hasUnsettledPayment &&
    allAttemptsFailed;

  if (explicitlyTerminal) {
    if (dryRun) {
      return { orderId: input.orderId, status: "RELEASED", action: "WOULD_RELEASE" };
    }
    const released = await releaseTerminalReservation(input.orderId);
    return released === "RELEASED" || released === "ALREADY_RELEASED"
      ? { orderId: input.orderId, status: "RELEASED", action: "RELEASED" }
      : needsReview(input.orderId, "Order changed during release; reservation was retained.");
  }

  if (remoteOrder.status === "created" || remoteOrder.status === "attempted") {
    if (reservation.expiresAt > now) {
      return { orderId: input.orderId, status: "RESERVED", action: "NO_CHANGE" };
    }
    if (!dryRun) await setReservationForReview(input.orderId);
    return needsReview(input.orderId, "Expired reservation still has a provider order that may accept payment.");
  }

  if (!dryRun) await setReservationForReview(input.orderId);
  return needsReview(input.orderId, "Provider returned a state that is not proven terminal.");
}

export async function reconcileCouponReservations(input: {
  provider: CouponPaymentReader;
  dryRun?: boolean;
  limit?: number;
  now?: Date;
}): Promise<CouponReservationReconcileResult[]> {
  const limit = Math.max(1, Math.min(input.limit ?? 25, 50));
  const reservations = await prisma.couponReservation.findMany({
    where: { status: { in: ["RESERVED", "REVIEW_REQUIRED"] } },
    orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
    take: limit,
    select: { orderId: true },
  });

  const results: CouponReservationReconcileResult[] = [];
  for (const reservation of reservations) {
    results.push(await reconcileCouponReservation({
      orderId: reservation.orderId,
      dryRun: input.dryRun,
      now: input.now,
      provider: input.provider,
    }));
  }
  return results;
}
