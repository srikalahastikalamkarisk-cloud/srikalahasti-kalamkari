import type { Metadata } from "next";
import { getPublicStoreSettings } from "@/lib/public-store-settings";
import "./globals.css";

const defaultTitle = "Srikalahasti Kalamkari | The Royal Art of Heritage";
const defaultDescription = "Discover Srikalahasti Kalamkari — traditional artistry, heritage-inspired collections and handcrafted elegance.";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPublicStoreSettings();
  const title = settings?.metaTitle || defaultTitle;
  const description = settings?.metaDescription || settings?.description || defaultDescription;

  return {
    title,
    description,
    applicationName: settings?.storeName || "Srikalahasti Kalamkari",
    icons: settings?.faviconUrl ? { icon: settings.faviconUrl } : undefined,
    openGraph: {
      title,
      description,
      siteName: settings?.storeName || "Srikalahasti Kalamkari",
      type: "website",
    },
  };
}

export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
