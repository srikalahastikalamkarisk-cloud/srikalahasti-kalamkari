export type ProviderOrderForRetry = {
  id?: unknown;
  amount?: unknown;
  amount_paid?: unknown;
  currency?: unknown;
  status?: unknown;
};

export type ProviderPaymentForRetry = { status?: unknown };

export function canRetryRazorpayOrder(input: {
  expectedOrderId: string;
  expectedAmountPaise: number;
  order: ProviderOrderForRetry;
  payments: ProviderPaymentForRetry[];
}): boolean {
  const { expectedOrderId, expectedAmountPaise, order, payments } = input;
  if (!Number.isSafeInteger(expectedAmountPaise) || expectedAmountPaise <= 0) return false;
  if (
    order.id !== expectedOrderId ||
    order.amount !== expectedAmountPaise ||
    order.amount_paid !== 0 ||
    order.currency !== "INR" ||
    (order.status !== "created" && order.status !== "attempted")
  ) return false;

  if (payments.length === 0) return order.status === "created";
  return order.status === "attempted" && payments.every(payment => payment.status === "failed");
}
