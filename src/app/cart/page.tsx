import Header from "@/components/storefront-header";
import PremiumFooter from "@/components/premium-footer";
import ShopAccountPages from "@/components/shop-account-pages";
import { getStorefrontProductsByIds } from "@/lib/storefront-products";

export const dynamic = "force-dynamic";

export default async function Page() {
  const products = await getStorefrontProductsByIds([]);

  return (
    <>
      <Header />
      <ShopAccountPages
        mode="cart"
        products={products}
      />
      <PremiumFooter />
    </>
  );
}
