import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { request as httpRequest } from "node:http";

const rawUrl = process.env.FIXTURE_TEST_DATABASE_URL;
const baseUrl = process.env.FIXTURE_TEST_BASE_URL;

test("isolated MySQL category hierarchy, product assignment, availability and dynamic routes", { skip: !rawUrl || !baseUrl }, async () => {
  const url = new URL(rawUrl!);
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "3307");
  assert.equal(decodeURIComponent(url.pathname.slice(1)), "sk_kalamkari_fix_test");
  assert.equal(decodeURIComponent(url.username), "sk_fix_test");
  assert.equal(baseUrl, "http://127.0.0.1:3001");

  process.env.DATABASE_URL = url.toString();
  const prisma = new PrismaClient({
    adapter: new PrismaMariaDb({
      host: url.hostname,
      port: Number(url.port),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.slice(1)),
      connectionLimit: 5,
      connectTimeout: 5000,
      allowPublicKeyRetrieval: true,
    }),
  });
  const suffix = randomUUID().replaceAll("-", "");
  const createdProductIds: string[] = [];
  const createdCategoryIds: string[] = [];
  let storefrontPrisma: { $disconnect: () => Promise<void> } | undefined;
  const prefix = `fixit-${suffix.slice(0, 12)}`;
  const productName = (kind: string) => `Fixture ${kind} ${suffix.slice(0, 8)}`;
  async function getPage(pathname: string) {
    return new Promise<{ status: number; html: string }>((resolve, reject) => {
      const request = httpRequest(new URL(pathname, baseUrl), { method: "GET", agent: false }, response => {
        const chunks: Buffer[] = [];
        response.on("data", chunk => chunks.push(Buffer.from(chunk)));
        response.on("end", () => resolve({ status: response.statusCode ?? 0, html: Buffer.concat(chunks).toString("utf8") }));
      });
      request.on("error", reject);
      request.end();
    });
  }
  const renderedProductNames = (html: string) => [...html.matchAll(/class="skshop-product-title-link"[^>]*>([^<]*)<\/a>/g)].map(match => match[1]);

  const identity = await prisma.$queryRaw<Array<{ databaseName: string; host: string; port: number; userName: string }>>`
    SELECT DATABASE() AS databaseName, @@hostname AS host, @@port AS port,
      SUBSTRING_INDEX(CURRENT_USER(), '@', 1) AS userName
  `;
  assert.equal(identity[0]?.databaseName, "sk_kalamkari_fix_test");
  assert.equal(Number(identity[0]?.port), 3307);
  assert.equal(identity[0]?.userName, "sk_fix_test");

  const root = await prisma.category.create({ data: { name: `${prefix} root`, slug: `${prefix}-root` } });
  createdCategoryIds.push(root.id);
  const child = await prisma.category.create({ data: { name: `${prefix} child`, slug: `${prefix}-child`, parentId: root.id } });
  createdCategoryIds.push(child.id);
  const grandchild = await prisma.category.create({ data: { name: `${prefix} grand`, slug: `${prefix}-grand`, parentId: child.id } });
  createdCategoryIds.push(grandchild.id);
  const unrelated = await prisma.category.create({ data: { name: `${prefix} unrelated`, slug: `${prefix}-unrelated` } });
  createdCategoryIds.push(unrelated.id);

  async function product(kind: string, categoryId: string, input: {
    stock: number;
    availabilityStatus: "IN_STOCK" | "OUT_OF_STOCK" | "COMING_SOON";
    variant?: { isActive: boolean; stock: number; price: string | null };
  }) {
    const created = await prisma.product.create({
      data: {
        name: productName(kind),
        slug: `${prefix}-${kind}`,
        categoryId,
        price: "100.00",
        stock: input.stock,
        availabilityStatus: input.availabilityStatus,
        ...(input.variant ? { variants: { create: {
          attributes: { Size: kind },
          price: input.variant.price,
          stock: input.variant.stock,
          isActive: input.variant.isActive,
        } } } : {}),
      },
      include: { variants: true },
    });
    createdProductIds.push(created.id);
    return created;
  }

  try {
    const rootProduct = await product("root", root.id, { stock: 1, availabilityStatus: "IN_STOCK" });
    const childProduct = await product("child", child.id, { stock: 1, availabilityStatus: "IN_STOCK" });
    const grandProduct = await product("grand", grandchild.id, { stock: 1, availabilityStatus: "IN_STOCK" });
    const unrelatedProduct = await product("unrelated", unrelated.id, { stock: 1, availabilityStatus: "IN_STOCK" });
    const variantProduct = await product("variant", grandchild.id, {
      stock: 0,
      availabilityStatus: "IN_STOCK",
      variant: { isActive: true, stock: 2, price: "125.00" },
    });
    const inactiveVariantProduct = await product("inactive-variant", grandchild.id, {
      stock: 0,
      availabilityStatus: "IN_STOCK",
      variant: { isActive: false, stock: 5, price: "125.00" },
    });
    const explicitOut = await product("explicit-out", root.id, { stock: 1, availabilityStatus: "OUT_OF_STOCK" });
    const comingSoon = await product("coming-soon", root.id, { stock: 1, availabilityStatus: "COMING_SOON" });
    const zeroStock = await product("zero", root.id, { stock: 0, availabilityStatus: "OUT_OF_STOCK" });

    const [{ getStorefrontProducts }, { belongsToCategory, hasPurchasableInventory }, { prisma: sharedPrisma }] = await Promise.all([
      import("../src/lib/storefront-products"),
      import("../src/lib/storefront-product-policy"),
      import("../src/lib/prisma"),
    ]);
    storefrontPrisma = sharedPrisma;
    const products = await getStorefrontProducts();
    const byId = new Map(products.map(item => [item.id, item]));
    const rootListing = products.filter(item => belongsToCategory(item, undefined, root.slug));
    const rootListingIds = rootListing.map(item => item.id).sort();
    const expectedRootListingIds = [rootProduct.id, childProduct.id, grandProduct.id, variantProduct.id, inactiveVariantProduct.id, explicitOut.id, comingSoon.id, zeroStock.id].sort();
    assert.deepEqual(rootListingIds, expectedRootListingIds, JSON.stringify(rootListing.map(item => ({ id: item.id, name: item.name, categoryId: item.categoryId, ancestorIds: item.categoryAncestorIds, ancestorSlugs: item.categoryAncestorSlugs }))));
    assert.equal(belongsToCategory(byId.get(grandProduct.id)!, child.id), true);
    assert.equal(belongsToCategory(byId.get(unrelatedProduct.id)!, undefined, root.slug), false);
    assert.equal(hasPurchasableInventory(byId.get(rootProduct.id)!), true);
    assert.equal(hasPurchasableInventory(byId.get(variantProduct.id)!), true);
    assert.equal(hasPurchasableInventory(byId.get(inactiveVariantProduct.id)!), false);
    assert.equal(hasPurchasableInventory(byId.get(explicitOut.id)!), false);
    assert.equal(hasPurchasableInventory(byId.get(comingSoon.id)!), false);
    assert.equal(hasPurchasableInventory(byId.get(zeroStock.id)!), false);

    const moved = await prisma.product.update({ where: { id: childProduct.id }, data: { categoryId: unrelated.id } });
    const afterMove = await getStorefrontProducts();
    assert.equal(afterMove.find(item => item.id === moved.id)?.categoryAncestorSlugs.includes(root.slug) ?? false, false);
    assert.equal(belongsToCategory(afterMove.find(item => item.id === moved.id)!, undefined, unrelated.slug), true);

    await prisma.category.update({ where: { id: child.id }, data: { isActive: false } });
    const withInactiveParent = await getStorefrontProducts();
    assert.equal(withInactiveParent.some(item => item.id === grandProduct.id || item.id === variantProduct.id), false);
    await prisma.category.update({ where: { id: child.id }, data: { isActive: true } });

    const rootPage = await getPage(`/${root.slug}`);
    assert.equal(rootPage.status, 200);
    const rootCards = renderedProductNames(rootPage.html);
    assert.ok(rootCards.includes(productName("root")));
    assert.ok(rootCards.includes(productName("grand")));
    assert.ok(!rootCards.includes(productName("unrelated")));

    const nestedPage = await getPage(`/${root.slug}?subcategory=${grandchild.slug}`);
    assert.equal(nestedPage.status, 200);
    const nestedCards = renderedProductNames(nestedPage.html);
    assert.ok(nestedCards.includes(productName("grand")));
    assert.ok(!nestedCards.includes(productName("child")));
    assert.ok(!nestedCards.includes(productName("unrelated")));

    const invalidSubcategory = await getPage(`/${root.slug}?subcategory=missing-${suffix}`);
    assert.equal(invalidSubcategory.status, 200);
    assert.deepEqual(renderedProductNames(invalidSubcategory.html), []);

    const allPieces = await getPage("/shop");
    assert.equal(allPieces.status, 200);
    assert.ok(renderedProductNames(allPieces.html).includes(productName("unrelated")));
    const invalidCategory = await getPage(`/missing-${suffix}`);
    assert.equal(invalidCategory.status, 404);
  } finally {
    if (createdProductIds.length) await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
    for (const id of [...createdCategoryIds].reverse()) {
      await prisma.category.delete({ where: { id } });
    }
    await storefrontPrisma?.$disconnect();
    await prisma.$disconnect();
  }
});
