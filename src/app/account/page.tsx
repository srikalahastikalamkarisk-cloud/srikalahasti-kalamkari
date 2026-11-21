import type { Metadata } from "next";
import Link from "next/link";
import PremiumHeader from "@/components/storefront-header";
import PremiumFooter from "@/components/premium-footer";
import "@/components/shop-account-pages.css";

export const metadata: Metadata = {
  title: "Customer Account | Srikalahasti Kalamkari",
  description: "Customer account access and store support.",
};

export default function AccountPage() {
  return (
    <>
      <PremiumHeader />
      <main id="main-content" className="skaccount">
        <div className="skaccount-wrap">
          <h1>Customer Account</h1>
          <section className="skaccount-empty">
            <h2>Online account access is not available yet.</h2>
            <p>Our team can help with product enquiries and store visits. Your cart and wishlist are available on this device.</p>
            <Link href="/contact">Contact our team</Link>
            <Link href="/shop">Continue shopping</Link>
          </section>
        </div>
      </main>
      <PremiumFooter />
    </>
  );
}
