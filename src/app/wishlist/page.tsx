import ShopAccountPages from "@/components/shop-account-pages";
import Header from "@/components/storefront-header";
import PremiumFooter from "@/components/premium-footer";
import { getStorefrontProducts } from "@/lib/storefront-products";

export const dynamic = "force-dynamic";

export default async function Page() {
  const products = await getStorefrontProducts();

  return (
    <>
      <Header />
      <ShopAccountPages
        mode="wishlist"
        products={products}
      />
      <PremiumFooter />
    </>
  );
}
