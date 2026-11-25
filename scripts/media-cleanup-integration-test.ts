import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { access, lstat, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import Module from "node:module";
import path from "node:path";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const EXPECTED_DB = "srikalahasti_media_cleanup_test";
const source = process.env.MEDIA_CLEANUP_TEST_DATABASE_URL;
const user = process.env.MEDIA_CLEANUP_TEST_DATABASE_USER;
const storageParent = process.env.MEDIA_CLEANUP_TEST_STORAGE_PARENT;
const expectedPort = process.env.MEDIA_CLEANUP_TEST_DATABASE_PORT;
if (!source || !user || !storageParent || !expectedPort) throw new Error("Set MEDIA_CLEANUP_TEST_DATABASE_URL, MEDIA_CLEANUP_TEST_DATABASE_USER, MEDIA_CLEANUP_TEST_DATABASE_PORT, and MEDIA_CLEANUP_TEST_STORAGE_PARENT; DATABASE_URL fallback is disabled");
const configuredStorageParent = storageParent;
const dbUrl = new URL(source);
if (dbUrl.hostname !== "127.0.0.1" || dbUrl.port !== expectedPort || dbUrl.pathname !== `/${EXPECTED_DB}` || decodeURIComponent(dbUrl.username) !== user) {
  throw new Error(`Refusing integration-test target ${dbUrl.hostname}:${dbUrl.port}${dbUrl.pathname}; expected dedicated ${EXPECTED_DB} on local 127.0.0.1:${expectedPort}`);
}
const prisma = new PrismaClient({ adapter: new PrismaMariaDb({
  host: dbUrl.hostname,
  port: Number(dbUrl.port),
  user: decodeURIComponent(dbUrl.username),
  password: decodeURIComponent(dbUrl.password),
  database: EXPECTED_DB,
  connectionLimit: 10,
  connectTimeout: 5000,
  allowPublicKeyRetrieval: true,
}) });

async function main() {
  const fs = await import("node:fs/promises");
  const rootParent = await fs.realpath(configuredStorageParent).catch(() => { throw new Error("Test storage parent must exist before running integration tests"); });
  const repo = await fs.realpath(process.cwd());
  if (rootParent === repo || rootParent.startsWith(`${repo}${path.sep}`)) throw new Error("Test media storage must be outside the repository");
  const storageRoot = await mkdtemp(path.join(rootParent, ".media-cleanup-test-"));
  process.env.MEDIA_STORAGE_DIR = storageRoot;
  const loader = Module as unknown as { _load: (request: string, parent: unknown, isMain: boolean) => unknown };
  const originalLoad = loader._load;
  loader._load = function(request, parent, isMain) {
    if (request === "server-only") return {};
    return originalLoad(request, parent, isMain);
  };
  const productIds: string[] = [];
  const orderIds: string[] = [];
  let categoryId = "";
  try {
    const [{ processMediaCleanupBatch }, refs] = await Promise.all([
      import("../src/lib/admin/media-cleanup-worker"),
      import("../src/lib/admin/global-media-references"),
    ]);
    for (const area of ["products", "categories", "hero-videos", "story-videos"]) await mkdir(path.join(storageRoot, area), { mode: 0o750 });
    const identity = await prisma.$queryRaw<Array<{ db: string; host: string; port: number }>>`SELECT DATABASE() AS db, @@hostname AS host, @@port AS port`;
    assert.equal(identity[0]?.db, EXPECTED_DB);
    assert.equal(Number(identity[0]?.port), Number(expectedPort));
    const expectedTables = ["StoreSettings", "MediaCleanupJob", "MediaAsset", "MediaReference", "Product", "Category", "ProductVariant", "OrderItem", "HeroSlide", "VideoStory", "CustomerGallery", "AboutKalamkariContent", "AboutPageContent"];
    const tableRows = await prisma.$queryRaw<Array<{ tableName: string }>>`SELECT TABLE_NAME AS tableName FROM information_schema.TABLES WHERE TABLE_SCHEMA = ${EXPECTED_DB}`;
    const tables = new Set(tableRows.map(row => row.tableName));
    for (const table of expectedTables) assert.ok(tables.has(table), `Missing migrated table ${table}`);
    const columns = await prisma.$queryRaw<Array<{ columnName: string }>>`SELECT COLUMN_NAME AS columnName FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ${EXPECTED_DB} AND TABLE_NAME = 'StoreSettings' AND COLUMN_NAME = 'mediaEpoch'`;
    assert.equal(columns.length, 1, "additive mediaEpoch migration must be present");
    assert.ok(await prisma.storeSettings.findUnique({ where: { id: "primary" } }), "Cleanup lock seed is missing");
    assert.ok(await prisma.mediaAsset.findUnique({ where: { id: "legacy-media-847" } }), "migration must preserve existing MediaAsset rows");
    const legacyJob = await prisma.mediaCleanupJob.findUnique({ where: { storageKey: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg" } });
    assert.equal(legacyJob?.status, "FAILED", "legacy deletion state must backfill to the generic queue");
    assert.equal(legacyJob?.attempts, 3, "migration must preserve retry attempts");
    const category = await prisma.category.create({ data: { name: `Cleanup test ${randomUUID()}`, slug: `cleanup-test-${randomUUID()}` } });
    categoryId = category.id;

    const putFile = async (key = `${randomUUID()}.jpg`) => {
      const file = path.join(storageRoot, "products", key);
      await writeFile(file, Buffer.from(`isolated fixture ${randomUUID()}`), { flag: "wx", mode: 0o640 });
      return { key, file };
    };
    const queue = (key: string) => prisma.mediaCleanupJob.create({ data: { storageKey: key, area: "products" } });
    const run = (batchSize = 1) => processMediaCleanupBatch(prisma, { batchSize, budgetMs: 1000 });
    const createProduct = (key: string, label: string) => prisma.product.create({ data: {
      name: `Cleanup ${label} ${randomUUID()}`, slug: `cleanup-test-${randomUUID()}`, categoryId,
      price: "100.00", stock: 0, availabilityStatus: "OUT_OF_STOCK", images: [`/api/media/products/${key}`],
    } });

    // Basic unreferenced deletion.
    const basic = await putFile();
    const basicJob = await queue(basic.key);
    assert.equal((await run()).removed, 1);
    await assert.rejects(access(basic.file));
    assert.equal((await prisma.mediaCleanupJob.findUniqueOrThrow({ where: { id: basicJob.id } })).status, "COMPLETED");
    console.log("PASS: unreferenced file is deleted and its job completes");

    // Shared product references and durable order-history snapshots protect a file.
    const shared = await putFile();
    const firstProduct = await createProduct(shared.key, "shared-a");
    const secondProduct = await createProduct(shared.key, "shared-b");
    productIds.push(firstProduct.id, secondProduct.id);
    const sharedJob = await queue(shared.key);
    await prisma.$transaction(async tx => {
      const before = await tx.product.findUniqueOrThrow({ where: { id: firstProduct.id } });
      await tx.product.delete({ where: { id: firstProduct.id } });
      await refs.queueReleasedMedia(tx, before, null);
    });
    assert.equal((await run()).protected, 1);
    await access(shared.file);
    await prisma.$transaction(async tx => {
      const before = await tx.product.findUniqueOrThrow({ where: { id: secondProduct.id } });
      await tx.product.delete({ where: { id: secondProduct.id } });
      await refs.queueReleasedMedia(tx, before, null);
    });
    assert.equal((await run()).removed, 1);
    await assert.rejects(access(shared.file));
    assert.equal((await prisma.mediaCleanupJob.findUniqueOrThrow({ where: { id: sharedJob.id } })).status, "COMPLETED");
    console.log("PASS: shared product reference protects a file until the last product detaches it");

    const snapshot = await putFile();
    const order = await prisma.order.create({ data: {
      orderNumber: `CLEANUP-${randomUUID()}`, customerName: "Media Cleanup Test", customerEmail: `${randomUUID()}@example.invalid`, customerPhone: "0000000000",
      address: "Disposable fixture", city: "Local", state: "Test", pincode: "000000", subtotal: "100.00", totalAmount: "100.00",
      items: { create: { productId: "deleted-product-snapshot", productName: "Historical item", productImage: `/api/media/products/${snapshot.key}`, quantity: 1, unitPrice: "100.00", totalPrice: "100.00" } },
    }, include: { items: true } });
    orderIds.push(order.id);
    const snapshotJob = await queue(snapshot.key);
    assert.equal((await run()).protected, 1);
    await access(snapshot.file);
    await prisma.$transaction(async tx => {
      await tx.order.delete({ where: { id: order.id } });
      await refs.queueReleasedMedia(tx, order.items, null);
    });
    assert.equal((await run()).removed, 1);
    await assert.rejects(access(snapshot.file));
    assert.equal((await prisma.mediaCleanupJob.findUniqueOrThrow({ where: { id: snapshotJob.id } })).status, "COMPLETED");
    console.log("PASS: order snapshot protects deleted-product media until the snapshot is removed");

    // Concurrent upload and attach is safe: a new random file is not visible to the queue before creation.
    const uploaded = await putFile();
    const unrelated = await putFile();
    await queue(unrelated.key);
    const uploadJobBefore = await prisma.mediaCleanupJob.findUnique({ where: { storageKey: uploaded.key } });
    assert.equal(uploadJobBefore, null);
    const attach = prisma.$transaction(async tx => {
      await refs.assertManagedMediaAvailable(tx, `/api/media/products/${uploaded.key}`);
      const product = await tx.product.create({ data: {
        name: `Cleanup upload ${randomUUID()}`, slug: `cleanup-test-${randomUUID()}`, categoryId,
        price: "100.00", stock: 0, availabilityStatus: "OUT_OF_STOCK", images: [`/api/media/products/${uploaded.key}`],
      } });
      productIds.push(product.id);
      return product;
    });
    const uploadRace = await Promise.all([attach, run()]);
    if (uploadRace[1].processed === 0) assert.equal((await run()).removed, 1, "worker must rescan after the attachment advances the mutation epoch");
    else assert.equal(uploadRace[1].removed, 1);
    await assert.rejects(access(unrelated.file));
    await access(uploaded.file);
    assert.ok(await prisma.product.findFirst({ where: { id: uploadRace[0].id } }));
    console.log("PASS: newly uploaded media attaches safely while the worker processes unrelated jobs");

    // Race cleanup against attachment and checkout-style order snapshot creation.
    for (const mode of ["product-attach", "checkout-snapshot"] as const) {
      const race = await putFile();
      const raceJob = await queue(race.key);
      const mutation = prisma.$transaction(async tx => {
        await refs.assertManagedMediaAvailable(tx, `/api/media/products/${race.key}`);
        if (mode === "product-attach") {
          const created = await tx.product.create({ data: {
            name: `Cleanup race ${randomUUID()}`, slug: `cleanup-test-${randomUUID()}`, categoryId,
            price: "100.00", stock: 0, availabilityStatus: "OUT_OF_STOCK", images: [`/api/media/products/${race.key}`],
          } });
          productIds.push(created.id);
        } else {
          const createdOrder = await tx.order.create({ data: {
            orderNumber: `CLEANUP-${randomUUID()}`, customerName: "Media Cleanup Test", customerEmail: `${randomUUID()}@example.invalid`, customerPhone: "0000000000",
            address: "Disposable fixture", city: "Local", state: "Test", pincode: "000000", subtotal: "100.00", totalAmount: "100.00",
            items: { create: { productId: "checkout-snapshot-fixture", productName: "Snapshot", productImage: `/api/media/products/${race.key}`, quantity: 1, unitPrice: "100.00", totalPrice: "100.00" } },
          } });
          orderIds.push(createdOrder.id);
        }
      });
      const outcomes = await Promise.allSettled([mutation, run()]);
      const mutationResult = outcomes[0];
      const job = await prisma.mediaCleanupJob.findUniqueOrThrow({ where: { id: raceJob.id } });
      if (mutationResult.status === "fulfilled") {
        await access(race.file);
        assert.ok(["CANCELLED", "PROTECTED"].includes(job.status));
      } else {
        await assert.rejects(access(race.file));
        assert.equal(job.status, "COMPLETED");
      }
      console.log(`PASS: concurrent ${mode} and cleanup result is either a retained attachment or a rejected attachment`);
    }

    // A symlink is never followed/unlinked; retries advance and stop at DEAD.
    const retry = await putFile();
    const symlinkPath = retry.file;
    await rm(symlinkPath);
    const symlinkTarget = path.join(storageRoot, "retry-target.jpg");
    await writeFile(symlinkTarget, Buffer.from("outside target"), { flag: "wx", mode: 0o640 });
    await symlink(symlinkTarget, symlinkPath);
    const retryJob = await queue(retry.key);
    for (let attempt = 1; attempt <= 8; attempt++) {
      await prisma.mediaCleanupJob.update({ where: { id: retryJob.id }, data: { nextAttemptAt: new Date(0) } });
      const retried = await run();
      assert.equal(retried.retried, 1);
      const current = await prisma.mediaCleanupJob.findUniqueOrThrow({ where: { id: retryJob.id } });
      assert.equal(current.attempts, attempt);
      assert.equal(current.status, attempt === 8 ? "DEAD" : "FAILED");
      await access(symlinkTarget);
    }
    assert.ok((await lstat(symlinkPath)).isSymbolicLink(), "failed cleanup must leave symlink itself untouched");
    await rm(symlinkPath);
    await rm(symlinkTarget);
    console.log("PASS: automatic retries back off and dead-letter at the configured attempt limit without following symlinks");

    // Simulate a worker crash after claim: expired lease is reclaimed and completed.
    const interrupted = await putFile();
    const interruptedJob = await prisma.mediaCleanupJob.create({ data: {
      storageKey: interrupted.key, area: "products", status: "PROCESSING", attempts: 1,
      lockedBy: "simulated-crashed-worker", leaseUntil: new Date(Date.now() - 1000),
    } });
    assert.equal((await run()).removed, 1);
    await assert.rejects(access(interrupted.file));
    const recovered = await prisma.mediaCleanupJob.findUniqueOrThrow({ where: { id: interruptedJob.id } });
    assert.equal(recovered.status, "COMPLETED");
    assert.equal(recovered.attempts, 2);
    console.log("PASS: interrupted worker lease is reclaimed and cleanup completes");
    console.log(`IDENTITY PASS: ${identity[0].db} at 127.0.0.1:${expectedPort}; migration preserved the legacy asset/job and backfilled attempts`);
  } finally {
    try {
      const identity = await prisma.$queryRaw<Array<{ db: string }>>`SELECT DATABASE() AS db`;
      assert.equal(identity[0]?.db, EXPECTED_DB, "Refusing cleanup outside dedicated integration database");
      if (productIds.length) await prisma.product.deleteMany({ where: { id: { in: productIds } } });
      if (orderIds.length) await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
      if (categoryId) await prisma.category.deleteMany({ where: { id: categoryId } });
      await prisma.mediaCleanupJob.deleteMany({ where: { storageKey: { endsWith: ".jpg", not: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg" } } });
    } catch (cleanupError) {
      console.error("Fixture database cleanup failed; disposable database must be dropped", cleanupError);
    } finally {
      await prisma.$disconnect();
      await rm(storageRoot, { recursive: true, force: true });
      await assert.rejects(access(storageRoot));
      loader._load = originalLoad;
    }
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
