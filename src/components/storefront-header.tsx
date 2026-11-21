import { prisma } from "@/lib/prisma";
import PremiumHeader from "@/components/premium-header";
import { getPublicStoreSettings } from "@/lib/public-store-settings";

export default async function StorefrontHeader() {
  const [categories, storeSettings] = await Promise.all([prisma.category.findMany({
    where: {
      isActive: true,
      parentId: null,
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      image: true,
      children: {
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          slug: true,
          image: true,
        },
      },
    },
  }), getPublicStoreSettings()]);

  return (
    <PremiumHeader
      categoriesFromDb={categories}
      storeSettings={storeSettings}
    />
  );
}
