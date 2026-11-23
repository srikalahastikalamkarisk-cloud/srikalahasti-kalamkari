import type { Metadata } from "next";
import Header from "@/components/storefront-header";
import PremiumFooter from "@/components/premium-footer";
import { getPublicStoreSettings } from "@/lib/public-store-settings";
import ContactExperience from "./contact-experience";
import "./contact.css";

export const metadata: Metadata = {
  title: "Contact Us | Srikalahasti Kalamkari",
  description: "Visit our Srikalahasti workshop and Tirupati store, or contact our team.",
  alternates: { canonical: "https://srikalahastikalamkari.in/contact" },
  openGraph: { title: "Contact Us | Srikalahasti Kalamkari", description: "Visit our Srikalahasti workshop and Tirupati store, or contact our team.", url: "https://srikalahastikalamkari.in/contact", type: "website" },
  twitter: { card: "summary", title: "Contact Us | Srikalahasti Kalamkari" },
};

export const dynamic = "force-dynamic";

export default async function ContactPage() {
  const settings = await getPublicStoreSettings();

  return (
    <>
      <Header />
      <main id="main-content">
        <ContactExperience settings={settings} />
      </main>
      <div className="skf-contact-page"><PremiumFooter /></div>
    </>
  );
}
