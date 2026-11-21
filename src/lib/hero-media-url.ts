export function heroMediaUrl(storageKey: string) {
  if (!/^[a-f0-9-]{36}\.(jpg|png|webp)$/.test(storageKey)) throw new Error("Invalid hero image storage key");
  return `/api/media/products/${storageKey}`;
}
