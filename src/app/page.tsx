import type { Metadata } from "next";

import PremiumFooter from "@/components/premium-footer";
import { getPublicStoreSettings } from "@/lib/public-store-settings";
import CustomerLove from "@/components/customer-love";
import { getHomepageCustomerLove } from "@/lib/customer-love";
import StoriesInMotion from "@/components/stories-in-motion";
import FeaturedProducts from "@/components/featured-products";
import CollectionsAndFabrics from "@/components/collections-and-fabrics";
import AboutKalamkari from "@/components/about-kalamkari";
import { getHomepageAboutKalamkari } from "@/lib/about-kalamkari";
import BestCollection from "@/components/best-collection";
import Header from "@/components/storefront-header";
import HeroSlider from "@/components/hero-slider";
import { getHomepageHeroSlides } from "@/lib/hero-slides";
import { getHomepageVideoStories } from "@/lib/video-stories";
import ShopByCategory from "@/components/shop-by-category";
import { getHomepageStorefrontProducts } from "@/lib/storefront-products";
import { HomeOrganizationJsonLd } from "@/components/seo-jsonld";

export const dynamic = "force-dynamic";

const siteUrl = "https://srikalahastikalamkari.in";
const homeTitle = "Srikalahasti Kalamkari | Hand-Painted Kalamkari Sarees";
const homeDescription = "Explore traditional Srikalahasti Kalamkari sarees featuring intricate hand-drawn and hand-painted artistry. Discover authentic Kalamkari craftsmanship and timeless designs.";

export const metadata: Metadata = {
  title: homeTitle,
  description: homeDescription,
  alternates: { canonical: `${siteUrl}/` },
  openGraph: { title: homeTitle, description: homeDescription, url: `${siteUrl}/`, type: "website", images: [{ url: "/intro/heritage-logo.png", alt: "Srikalahasti Kalamkari" }] },
  twitter: { card: "summary_large_image", title: homeTitle, description: homeDescription, images: ["/intro/heritage-logo.png"] },
};

export default async function Home() {
  const [aboutKalamkari, products, heroSlides, videoStories, storeSettings, customerLove] = await Promise.all([
    getHomepageAboutKalamkari(),
    getHomepageStorefrontProducts(),
    getHomepageHeroSlides(),
    getHomepageVideoStories(),
    getPublicStoreSettings(),
    getHomepageCustomerLove(),
  ]);
  const featuredProducts = products.filter(p => p.isFeatured).slice(0, 12);
  return (
    <>
      <Header />
      <main id="main-content">
        <HeroSlider slides={heroSlides} />
        <ShopByCategory />
          <BestCollection whatsappNumber={storeSettings?.whatsappNumber} variant="discover" products={products} />
        <BestCollection whatsappNumber={storeSettings?.whatsappNumber} variant="best" products={products.filter(p => p.isFeatured)} />
        {false && <CollectionsAndFabrics />}
        <FeaturedProducts whatsappNumber={storeSettings?.whatsappNumber} products={featuredProducts} />

      <AboutKalamkari {...aboutKalamkari} />
        <StoriesInMotion stories={videoStories} />
        <CustomerLove photos={customerLove.photos} reviews={customerLove.reviews} />


      </main>
      <PremiumFooter />
      <HomeOrganizationJsonLd storeName={storeSettings?.storeName || "Srikalahasti Kalamkari"} logoUrl={storeSettings?.logoUrl || "/intro/heritage-logo.png"} email={storeSettings?.contactEmail} phone={storeSettings?.contactPhone} />
    </>
  );
}
