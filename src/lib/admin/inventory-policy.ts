export type AvailabilityStatus = "IN_STOCK" | "OUT_OF_STOCK" | "COMING_SOON";

export function synchronizeAvailability(
  stock: number,
  current: AvailabilityStatus,
  requested?: AvailabilityStatus
): AvailabilityStatus {
  if (requested) {
    return requested === "IN_STOCK" && stock === 0
      ? "OUT_OF_STOCK"
      : requested;
  }
  if (current === "COMING_SOON") return "COMING_SOON";
  return stock === 0 ? "OUT_OF_STOCK" : "IN_STOCK";
}
