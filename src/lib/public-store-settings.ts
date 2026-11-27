import "server-only";

import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

export const PUBLIC_STORE_SETTINGS_CACHE_TAG = "public-store-settings";

export type PublicStoreSettings = {
  themeId: string | null;
  storeName: string | null;
  description: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  whatsappNumber: string | null;
  address: string | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
  youtubeUrl: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
};

function optionalText(value: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function optionalHttpsUrl(value: string | null) {
  const normalized = optionalText(value);
  if (!normalized) return null;
  try {
    return new URL(normalized).protocol === "https:" ? normalized : null;
  } catch {
    return null;
  }
}

function optionalLogoUrl(value: string | null) {
  const normalized = optionalText(value);
  if (!normalized) return null;

  if (/^\/api\/media\/products\/[a-f0-9-]{36}\.(png|jpg|webp)$/.test(normalized)) {
    return normalized;
  }

  return optionalHttpsUrl(normalized);
}

function optionalFaviconUrl(value: string | null) {
  const normalized = optionalText(value);
  if (!normalized) return null;
  if (/^\/api\/media\/products\/[a-f0-9-]{36}\.(png|jpg|webp|ico)$/.test(normalized)) return normalized;
  return optionalHttpsUrl(normalized);
}

const loadPublicStoreSettings = unstable_cache(async (): Promise<PublicStoreSettings | null> => {
  const settings = await prisma.storeSettings.findUnique({
    where: { id: "primary" },
    select: {
      themeId: true,
      storeName: true,
      description: true,
      logoUrl: true,
      faviconUrl: true,
      contactEmail: true,
      contactPhone: true,
      whatsappNumber: true,
      address: true,
      instagramUrl: true,
      facebookUrl: true,
      youtubeUrl: true,
      metaTitle: true,
      metaDescription: true,
    },
  });
  if (!settings) return null;

  return {
    themeId: optionalText(settings.themeId),
    storeName: optionalText(settings.storeName),
    description: optionalText(settings.description),
    logoUrl: optionalLogoUrl(settings.logoUrl),
    faviconUrl: optionalFaviconUrl(settings.faviconUrl),
    contactEmail: optionalText(settings.contactEmail),
    contactPhone: optionalText(settings.contactPhone),
    whatsappNumber: optionalText(settings.whatsappNumber),
    address: optionalText(settings.address),
    instagramUrl: optionalHttpsUrl(settings.instagramUrl),
    facebookUrl: optionalHttpsUrl(settings.facebookUrl),
    youtubeUrl: optionalHttpsUrl(settings.youtubeUrl),
    metaTitle: optionalText(settings.metaTitle),
    metaDescription: optionalText(settings.metaDescription),
  };
}, ["public-store-settings-v1"], {
  tags: [PUBLIC_STORE_SETTINGS_CACHE_TAG],
  revalidate: 60,
});

export async function getPublicStoreSettings(): Promise<PublicStoreSettings | null> {
  try {
    return await loadPublicStoreSettings();
  } catch {
    // Settings are optional. Keep the storefront available with its existing defaults.
    return null;
  }
}
