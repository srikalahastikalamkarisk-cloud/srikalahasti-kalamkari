import type { Metadata } from "next";
import { getPublicStoreSettings } from "@/lib/public-store-settings";
import "./globals.css";
import StorefrontMotion from "@/components/storefront-motion";
import "./step443-universal-alternate-palettes.css";
import { ORIGINAL_THEME_ID, resolveStoreTheme, STORE_THEME_BY_ID, themeCssVariables } from "@/lib/store-themes";
import type { CSSProperties } from "react";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/admin-auth";

const defaultTitle = "Srikalahasti Kalamkari | The Royal Art of Heritage";
const defaultDescription = "Discover Srikalahasti Kalamkari — traditional artistry, heritage-inspired collections and handcrafted elegance.";
const siteUrl = "https://srikalahastikalamkari.in";

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  const settings = await getPublicStoreSettings();
  const title = settings?.metaTitle || defaultTitle;
  const description = settings?.metaDescription || settings?.description || defaultDescription;

  return {
    metadataBase: new URL(siteUrl),
    title,
    description,
    applicationName: settings?.storeName || "Srikalahasti Kalamkari",
    icons: { icon: settings?.faviconUrl || "/favicon.ico" },
    openGraph: {
      title,
      description,
      siteName: settings?.storeName || "Srikalahasti Kalamkari",
      type: "website",
      locale: "en_IN",
      images: [{ url: settings?.logoUrl || "/intro/heritage-logo.png", alt: settings?.storeName || "Srikalahasti Kalamkari" }],
    },
    twitter: { card: "summary_large_image", title, description, images: [settings?.logoUrl || "/intro/heritage-logo.png"] },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await connection();
  // Published theme is shared; private preview cookie is honored only for authenticated admins.
  let publishedId = ORIGINAL_THEME_ID;
  try {
    const settings = await prisma.storeSettings.findUnique({
      where: { id: "primary" },
      select: { themeId: true },
    });
    publishedId = settings?.themeId || ORIGINAL_THEME_ID;
  } catch (error) {
    console.error("Unable to load published storefront theme", error);
  }

  const previewId = (await cookies()).get("sk_theme_private_preview")?.value;
  const admin = previewId ? await getCurrentAdmin() : null;
  const privatePreviewId = admin && previewId && STORE_THEME_BY_ID.has(previewId)
    ? previewId
    : undefined;
  const theme = resolveStoreTheme(privatePreviewId || publishedId);

  return (
    <html lang="en" data-storefront-theme={theme.id} style={themeCssVariables(theme) as CSSProperties}>
      <body>
        <div className="sk-store-theme">
          {children}
          <StorefrontMotion />
        </div>
      </body>
    </html>
  );
}
