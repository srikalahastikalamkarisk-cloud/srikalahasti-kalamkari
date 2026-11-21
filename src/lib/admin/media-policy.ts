export function detachImage(images: unknown, imageUrl: string) {
  const list = Array.isArray(images) ? images.filter((value): value is string => typeof value === "string") : [];
  return list.filter(value => value !== imageUrl);
}

export function canGloballyDelete(input: { untrackedProductReferences: number; unsupportedPlacements: number }) {
  return input.untrackedProductReferences === 0 && input.unsupportedPlacements === 0;
}
