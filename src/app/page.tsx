export const dynamic = "force-dynamic";

import PremiumFooter from "@/components/premium-footer";
import HeritageIntro from "@/components/heritage-intro";
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
import { getStorefrontProducts } from "@/lib/storefront-products";

export default async function Home() {
  const aboutKalamkari = await getHomepageAboutKalamkari();
  const [products, heroSlides, videoStories, storeSettings, customerLove] = await Promise.all([
    getStorefrontProducts(),
    getHomepageHeroSlides(),
    getHomepageVideoStories(),
    getPublicStoreSettings(),
    getHomepageCustomerLove(),
  ]);
  const featuredProducts = products.filter(p => p.isFeatured).slice(0, 12);
  return (
    <>
      <HeritageIntro
        logoUrl={storeSettings?.logoUrl}
        storeName={storeSettings?.storeName}
      />
      <Header />
      <main id="main-content">
        <HeroSlider slides={heroSlides} />
        <ShopByCategory />
        <BestCollection variant="discover" products={products} />
        <BestCollection variant="best" products={products.filter(p => p.isFeatured)} />
        {false && <CollectionsAndFabrics />}
        <FeaturedProducts products={featuredProducts} />

      <AboutKalamkari {...aboutKalamkari} />
        <StoriesInMotion stories={videoStories} />
        <CustomerLove photos={customerLove.photos} reviews={customerLove.reviews} />
        
        
      </main>
      <PremiumFooter />
    </>
  );
}
