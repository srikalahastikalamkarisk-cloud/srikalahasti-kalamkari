import { getPublicStoreSettings } from "@/lib/public-store-settings";
import Header from "@/components/storefront-header";
import PremiumFooter from "@/components/premium-footer";
import ShopAccountPages from "@/components/shop-account-pages";
import { getStorefrontProductsByIds } from "@/lib/storefront-products";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [products, settings] = await Promise.all([
    getStorefrontProductsByIds([]),
    getPublicStoreSettings(),
  ]);

  return (
    <>
      <Header />
      <ShopAccountPages
        whatsappNumber={settings?.whatsappNumber}
        mode="cart"
        products={products}
      />
      <PremiumFooter />
    </>
  );
}
