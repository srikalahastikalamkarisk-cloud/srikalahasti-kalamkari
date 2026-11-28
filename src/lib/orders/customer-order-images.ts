import "server-only";
import { prisma } from "@/lib/prisma";
import { storefrontImageList } from "@/lib/storefront-product-policy";

type OrderImageItem = {
  productId: string;
  productImage: string | null;
};

export async function resolveCustomerOrderImages<T extends OrderImageItem>(
  items: T[]
): Promise<T[]> {
  const ids = [...new Set(
    items.filter(item => !item.productImage)
      .map(item => item.productId)
  )];

  if (!ids.length) return items;

  const products = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: { id: true, images: true },
  });

  const images = new Map(
    products.map(product => [
      product.id,
      storefrontImageList(product.images)[0] ?? null,
    ])
  );

  return items.map(item => ({
    ...item,
    productImage: item.productImage ||
      images.get(item.productId) || null,
  }));
}
