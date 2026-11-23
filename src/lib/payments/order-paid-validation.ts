export type RazorpayPaidOrderSnapshot = {
  id?: unknown;
  amount?: unknown;
  amount_paid?: unknown;
  currency?: unknown;
  status?: unknown;
};

export function isAuthoritativePaidOrder(input: {
  expectedOrderId: string;
  expectedAmountPaise: number;
  payload: RazorpayPaidOrderSnapshot;
  provider: RazorpayPaidOrderSnapshot;
}): boolean {
  const { expectedOrderId, expectedAmountPaise, payload, provider } = input;
  return Number.isSafeInteger(expectedAmountPaise) && expectedAmountPaise > 0 &&
    payload.id === expectedOrderId && provider.id === expectedOrderId &&
    payload.currency === "INR" && provider.currency === "INR" &&
    payload.status === "paid" && provider.status === "paid" &&
    payload.amount === expectedAmountPaise &&
    payload.amount_paid === expectedAmountPaise &&
    provider.amount === expectedAmountPaise &&
    provider.amount_paid === expectedAmountPaise;
}
