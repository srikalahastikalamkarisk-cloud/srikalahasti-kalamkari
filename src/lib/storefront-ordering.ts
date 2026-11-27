export function restoreRequestedOrder<T extends { id: string }>(
  rows: readonly T[],
  requestedIds: readonly string[],
): T[] {
  const rank = new Map(requestedIds.map((id, index) => [id, index]));
  return [...rows].sort((left, right) =>
    (rank.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
    (rank.get(right.id) ?? Number.MAX_SAFE_INTEGER)
  );
}
