import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { lockMediaMutation } from "./media-mutation-lock";
import { queueReleasedMedia } from "./global-media-references";

type Transaction = Prisma.TransactionClient;

export class CatalogDeletionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogDeletionError";
  }
}

export async function deleteProduct(tx: Transaction, productId: string) {
  await lockMediaMutation(tx);
  const product = await tx.product.findUnique({
    where: { id: productId },
    select: { id: true, images: true, specifications: true, variants: { select: { imageUrl: true, attributes: true } } },
  });
  if (!product) throw new CatalogDeletionError("PRODUCT_NOT_FOUND");

  // OrderItem is a historical snapshot and has no Product relation/FK.
  // The product's variants cascade through the declared ProductVariant FK.
  await tx.product.delete({ where: { id: productId } });
  await queueReleasedMedia(tx, product, null);
}

export async function deleteSelectedProducts(
  tx: Transaction,
  productIds: string[]
) {
  if (new Set(productIds).size !== productIds.length) {
    throw new CatalogDeletionError("DUPLICATE_PRODUCT_IDS");
  }

  await lockMediaMutation(tx);
  const existing = await tx.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, images: true, specifications: true, variants: { select: { imageUrl: true, attributes: true } } },
  });
  if (existing.length !== productIds.length) {
    throw new CatalogDeletionError("PRODUCTS_CHANGED");
  }

  const result = await tx.product.deleteMany({
    where: { id: { in: productIds } },
  });
  if (result.count !== productIds.length) {
    throw new CatalogDeletionError("PRODUCTS_CHANGED");
  }
  await queueReleasedMedia(tx, existing, null);
  return result.count;
}

export async function deleteAllProducts(
  tx: Transaction,
  expectedCount: number
) {
  await lockMediaMutation(tx);
  const products = await tx.product.findMany({ select: { id: true, images: true, specifications: true, variants: { select: { imageUrl: true, attributes: true } } } });
  const count = products.length;
  if (count !== expectedCount) {
    throw new CatalogDeletionError("PRODUCT_COUNT_CHANGED");
  }

  const result = await tx.product.deleteMany();
  if (result.count !== count) {
    throw new CatalogDeletionError("PRODUCTS_CHANGED");
  }
  await queueReleasedMedia(tx, products, null);
  return result.count;
}

export async function deleteCategoryTree(
  tx: Transaction,
  input: {
    categoryId: string;
    confirmName: string;
    expectedCategoryCount: number;
    expectedProductCount: number;
  }
) {
  await lockMediaMutation(tx);
  const categories = await tx.category.findMany({
    select: { id: true, name: true, parentId: true, image: true },
  });
  const root = categories.find(category => category.id === input.categoryId);
  if (!root) return null;
  if (root.name !== input.confirmName) {
    throw new CatalogDeletionError("CATEGORY_CONFIRMATION_MISMATCH");
  }

  const childrenByParent = new Map<string, string[]>();
  for (const category of categories) {
    if (!category.parentId) continue;
    const children = childrenByParent.get(category.parentId) ?? [];
    children.push(category.id);
    childrenByParent.set(category.parentId, children);
  }

  const categoryIds: string[] = [];
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visited.has(id)) throw new CatalogDeletionError("CATEGORY_TREE_CYCLE");
    visited.add(id);
    categoryIds.push(id);
    for (const childId of childrenByParent.get(id) ?? []) visit(childId);
  };
  visit(input.categoryId);

  const products = await tx.product.findMany({
    where: { categoryId: { in: categoryIds } },
    select: { id: true, images: true, specifications: true, variants: { select: { imageUrl: true, attributes: true } } },
  });
  if (
    categoryIds.length !== input.expectedCategoryCount ||
    products.length !== input.expectedProductCount
  ) {
    throw new CatalogDeletionError("CATEGORY_DELETE_COUNTS_CHANGED");
  }

  if (products.length) {
    await tx.product.deleteMany({
      where: { id: { in: products.map(product => product.id) } },
    });
  }

  // Category.parent uses ON DELETE RESTRICT. Delete leaves before ancestors.
  for (const categoryId of categoryIds.reverse()) {
    await tx.category.delete({ where: { id: categoryId } });
  }
  await queueReleasedMedia(tx, [...categories.filter(category => visited.has(category.id)), ...products], null);

  return { categoryCount: categoryIds.length, productCount: products.length };
}
