export type FulfillmentStatus = "PENDING" | "PROCESSING" | "SHIPPED" | "DELIVERED";

const forwardTransition: Partial<Record<FulfillmentStatus, FulfillmentStatus>> = {
  PENDING: "PROCESSING",
  PROCESSING: "SHIPPED",
  SHIPPED: "DELIVERED",
};

export function nextFulfillmentStatus(status: string): FulfillmentStatus | undefined {
  return forwardTransition[status as FulfillmentStatus];
}

export function fulfillmentEligible(paymentStatus: string, inventoryStatus: string) {
  return paymentStatus === "PAID" && inventoryStatus === "DEDUCTED";
}

export function isValidForwardTransition(current: string, requested: string) {
  return nextFulfillmentStatus(current) === requested;
}
