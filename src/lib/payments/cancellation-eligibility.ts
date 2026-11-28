export function cancellationEligibility(
  expectedOrderId: string,
  expectedAmount: number,
  provider: unknown,
  collection: unknown
): "ELIGIBLE" | "PAYMENT_FOUND" | "VERIFY_FAILED" {
  if (!provider || typeof provider !== "object" ||
      !collection || typeof collection !== "object" ||
      !Number.isSafeInteger(expectedAmount) ||
      expectedAmount <= 0) return "VERIFY_FAILED";

  const order = provider as Record<string, unknown>;
  const data = collection as Record<string, unknown>;

  if (
    order.id !== expectedOrderId ||
    order.currency !== "INR" ||
    order.amount !== expectedAmount ||
    order.amount_paid !== 0 ||
    !["created", "attempted"].includes(String(order.status))
  ) return "PAYMENT_FOUND";

  if (
    !Array.isArray(data.items) ||
    typeof data.count !== "number" ||
    !Number.isSafeInteger(data.count) ||
    data.count !== data.items.length ||
    data.items.length >= 100 ||
    order.attempts !== data.items.length
  ) return "VERIFY_FAILED";

  for (const payment of data.items) {
    if (!payment || typeof payment !== "object")
      return "VERIFY_FAILED";

    if (
      payment.status !== "failed" ||
      payment.order_id !== expectedOrderId ||
      payment.captured !== false
    ) return "PAYMENT_FOUND";
  }

  if (
    (order.status === "attempted" && data.items.length === 0) ||
    (order.status === "created" && data.items.length > 0)
  ) return "VERIFY_FAILED";

  return "ELIGIBLE";
}
