import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Module from "node:module";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { NextRequest } from "next/server";
import { extractPhotoZip } from "../src/lib/admin/photo-zip";
import { saveProductImage } from "../src/lib/admin/secure-image-import";
import { detachImage, canGloballyDelete } from "../src/lib/admin/media-policy";
import { mediaStorageRoot, confinedMediaPath } from "../src/lib/admin/media-storage";

const TARGET_DB = "srikalahasti_availability_restore_test";
const SOURCE = process.env.MEDIA_TEST_DATABASE_URL;
if (!SOURCE) throw new Error("Set MEDIA_TEST_DATABASE_URL to dedicated isolated-test credentials; DATABASE_URL fallback is intentionally disabled");
const dbUrl = new URL(SOURCE);
const dedicatedUser = process.env.MEDIA_TEST_DATABASE_USER;
if (!dedicatedUser || decodeURIComponent(dbUrl.username) !== dedicatedUser) throw new Error("Set MEDIA_TEST_DATABASE_USER and use a dedicated isolated-test MySQL account");
if (dbUrl.hostname !== "127.0.0.1" || dbUrl.port !== "3306" || dbUrl.pathname !== `/${TARGET_DB}`) {
  throw new Error(`Refusing target ${dbUrl.hostname}:${dbUrl.port}${dbUrl.pathname}; required 127.0.0.1:3306/${TARGET_DB}`);
}

const storageParent = process.env.MEDIA_TEST_STORAGE_PARENT || path.join(os.homedir(), "srikalahasti-media-storage");
const parentReal = await import("node:fs/promises").then(fs => fs.realpath(storageParent).catch(() => { throw new Error(`Create the release-external storage parent first: ${storageParent}`); }));
const repoReal = await import("node:fs/promises").then(fs => fs.realpath(process.cwd()));
if (parentReal === repoReal || parentReal.startsWith(`${repoReal}${path.sep}`)) throw new Error("Media test storage parent must be outside the release directory");
let storageDir = "";
const previousDatabaseUrl = process.env.DATABASE_URL;
const previousMediaStorageDir = process.env.MEDIA_STORAGE_DIR;

const prisma = new PrismaClient({ adapter: new PrismaMariaDb(dbUrl.toString()) });
const suffix = randomUUID().replaceAll("-", "");
const productIds: string[] = [];
const folderIds: string[] = [];
const assetIds: string[] = [];
const adminEnabled = true;
let routePrisma: PrismaClient | undefined;

const loader = Module as unknown as { _load: (request: string, parent: unknown, isMain: boolean) => unknown };
const originalLoad = loader._load;
loader._load = function(request, parent, isMain) {
  if (request === "server-only") return {};
  if (request === "@/lib/admin-auth") return { getCurrentAdmin: async () => adminEnabled ? { id: "media006-test-admin", email: "media006-test@example.invalid" } : null };
  return originalLoad(request, parent, isMain);
};

function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}

function singleImageZip(filename: string, bytes: Buffer) {
  const name = Buffer.from(filename), compressed = bytes, crc = crc32(bytes);
  const local = Buffer.alloc(30 + name.length);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(bytes.length, 22); local.writeUInt16LE(name.length, 26); name.copy(local, 30);
  const central = Buffer.alloc(46 + name.length);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(bytes.length, 24); central.writeUInt16LE(name.length, 28); name.copy(central, 46);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length, 12); end.writeUInt32LE(local.length + compressed.length, 16);
  return Buffer.concat([local, compressed, central, end]);
}

async function routeModules() {
  const [folders, media, mediaItem, retry, registration, mediaPrisma] = await Promise.all([
    import("../src/app/api/admin/media/folders/route"),
    import("../src/app/api/admin/media/route"),
    import("../src/app/api/admin/media/[id]/route"),
    import("../src/app/api/admin/media/deletion-jobs/retry/route"),
    import("../src/lib/admin/register-media"),
    import("../src/lib/prisma"),
  ]);
  routePrisma = mediaPrisma.prisma as PrismaClient;
  return { folders, media, mediaItem, retry, registerProductImages: registration.registerProductImages };
}

function request(url: string, method: string, body?: BodyInit, contentType?: string) {
  const headers = new Headers({ origin: "http://localhost" });
  if (contentType) headers.set("content-type", contentType);
  return new NextRequest(`http://localhost${url}`, { method, headers, body });
}

async function main() {
  const identity = await prisma.$queryRaw<Array<{ db: string; host: string; port: number }>>`SELECT DATABASE() AS db, @@hostname AS host, @@port AS port`;
  assert.equal(identity[0]?.db, TARGET_DB, "Refusing fixture writes outside isolated database");
  assert.equal(Number(identity[0]?.port), 3306);
  const schemaRows = await prisma.$queryRaw<Array<{ tableName: string }>>`SELECT TABLE_NAME AS tableName FROM information_schema.TABLES WHERE TABLE_SCHEMA = ${TARGET_DB} AND TABLE_NAME IN ('MediaAsset','MediaFolder','MediaReference','MediaDeletionJob')`;
  assert.equal(new Set(schemaRows.map(row => row.tableName)).size, 4, "Media migration is not applied to isolated database");
  const category = await prisma.category.findFirst({ select: { id: true } });
  assert.ok(category, "Isolated DB needs an existing category fixture");
  storageDir = await mkdtemp(path.join(parentReal, ".media006-test-"));
  process.env.MEDIA_STORAGE_DIR = storageDir;
  process.env.DATABASE_URL = dbUrl.toString();
  assert.equal(await mediaStorageRoot(), storageDir);
  await assert.rejects(confinedMediaPath("../unsafe.jpg"), /Invalid media storage key/);
  console.log(`IDENTITY PASS: ${identity[0].db} via 127.0.0.1:3306 (server ${identity[0].host})`);

  let imagePaths: string[] = [];
  let storageKeys: string[] = [];

  try {
    const { folders, media, mediaItem, retry, registerProductImages } = await routeModules();
    const csvBytes = Buffer.from([255, 216, 255, 1, 2, 3]);
    const csvImage = await saveProductImage(csvBytes, "jpg");
    const zipImageBytes = Buffer.from([255, 216, 255, 4, 5, 6]);
    const extracted = extractPhotoZip(singleImageZip("902.jpg", zipImageBytes), ["902"]);
    const zipImage = await saveProductImage(extracted.get("902")!.bytes, "jpg");
    imagePaths = [csvImage, zipImage];
    storageKeys = imagePaths.map(value => value.split("/").pop()!);
    let response: Response = await folders.POST(request("/api/admin/media/folders", "POST", JSON.stringify({ action: "create", name: `M006 ${suffix}` }), "application/json"));
    assert.equal(response.status, 201); const rootFolder = (await response.json() as { folder: { id: string } }).folder; folderIds.push(rootFolder.id);
    response = await folders.POST(request("/api/admin/media/folders", "POST", JSON.stringify({ action: "create", name: `Child ${suffix}`, parentId: rootFolder.id }), "application/json"));
    assert.equal(response.status, 201); const childFolder = (await response.json() as { folder: { id: string } }).folder; folderIds.push(childFolder.id);
    response = await folders.POST(request("/api/admin/media/folders", "POST", JSON.stringify({ action: "rename", id: childFolder.id, name: `Renamed ${suffix}` }), "application/json"));
    assert.equal(response.status, 200); assert.equal((await response.json() as { folder: { name: string } }).folder.name, `Renamed ${suffix}`);
    console.log("PASS: folder create, subfolder create, rename");

    const product = await prisma.product.create({ data: {
      name: `Media006 ${suffix}`, slug: `media006-${suffix}`, categoryId: category!.id,
      price: "100.00", stock: 2, availabilityStatus: "IN_STOCK", images: imagePaths,
    } }); productIds.push(product.id);
    await prisma.$transaction(tx => registerProductImages(tx, product.id, imagePaths, ["901", "902"]));
    const registrations = await prisma.mediaAsset.findMany({ where: { storageKey: { in: storageKeys } } });
    assetIds.push(...registrations.map(asset => asset.id));
    assert.equal(registrations.length, 2);
    assert.deepEqual((await prisma.mediaReference.findMany({ where: { productId: product.id }, orderBy: { sortOrder: "asc" } })).map(ref => ref.sortOrder), [0, 1]);
    console.log("PASS: CSV and ZIP images registered and attached in gallery order");

    const firstAsset = registrations.find(asset => asset.storageKey === storageKeys[0])!;
    response = await mediaItem.POST(request(`/api/admin/media/${firstAsset.id}`, "POST", JSON.stringify({ action: "move", folderId: childFolder.id }), "application/json"), { params: Promise.resolve({ id: firstAsset.id }) });
    assert.equal(response.status, 200); assert.equal((await prisma.mediaAsset.findUniqueOrThrow({ where: { id: firstAsset.id } })).folderId, childFolder.id);
    response = await mediaItem.POST(request(`/api/admin/media/${firstAsset.id}`, "POST", JSON.stringify({ action: "remove-product", productId: product.id }), "application/json"), { params: Promise.resolve({ id: firstAsset.id }) });
    assert.equal(response.status, 200);
    const detached = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    assert.deepEqual(detachImage(detached.images, imagePaths[0]), [imagePaths[1]]);
    assert.deepEqual(detached.images, [imagePaths[1]], "Next gallery image becomes main image after detachment");
    assert.equal(await prisma.mediaReference.count({ where: { mediaId: firstAsset.id, productId: product.id } }), 0);
    assert.equal(await access((await confinedMediaPath(storageKeys[0])).target).then(() => true), true, "Detach must preserve physical file");
    await mediaItem.POST(request(`/api/admin/media/${firstAsset.id}`, "POST", JSON.stringify({ action: "move", folderId: null }), "application/json"), { params: Promise.resolve({ id: firstAsset.id }) });
    console.log("PASS: move and product detach preserve file; next image becomes main");

    response = await mediaItem.POST(request(`/api/admin/media/${registrations[1].id}`, "POST", JSON.stringify({ action: "preview-delete" }), "application/json"), { params: Promise.resolve({ id: registrations[1].id }) });
    const preview = await response.json() as { canDelete: boolean; unsupportedPlacements: string[]; products: Array<{ id: string }> };
    assert.equal(preview.canDelete, false);
    assert.ok(preview.products.some(item => item.id === product.id));
    for (const label of ["Homepage sections (hardcoded, unindexed)", "Stories (hardcoded, unindexed)", "Banners and other static placements (unindexed)"]) assert.ok(preview.unsupportedPlacements.includes(label));
    assert.equal(canGloballyDelete({ untrackedProductReferences: 0, unsupportedPlacements: preview.unsupportedPlacements.length }), false);
    response = await mediaItem.DELETE(request(`/api/admin/media/${registrations[1].id}`, "DELETE", JSON.stringify({ confirm: true }), "application/json"), { params: Promise.resolve({ id: registrations[1].id }) });
    assert.equal(response.status, 409); assert.equal(await access((await confinedMediaPath(storageKeys[1])).target).then(() => true), true);
    console.log("PASS: global deletion previews tracked product and blocks unknown homepage/story/banner usages");

    const uploadedBytes = Buffer.from([255, 216, 255, 7, 8]);
    const uploadForm = new FormData(); uploadForm.set("file", new File([uploadedBytes], `upload-${suffix}.jpg`, { type: "image/jpeg" })); uploadForm.set("folderId", rootFolder.id);
    response = await media.POST(request("/api/admin/media", "POST", uploadForm));
    assert.equal(response.status, 201); const uploadResult = await response.json() as { asset: { id: string; storageKey: string } }; assetIds.push(uploadResult.asset.id);
    const cleanupKey = uploadResult.asset.storageKey;
    const cleanupFile = (await confinedMediaPath(cleanupKey)).target;
    const failedJob = await prisma.mediaDeletionJob.create({ data: { mediaId: uploadResult.asset.id, storageKey: cleanupKey, status: "FAILED", attempts: 1, lastError: "Simulated transient unlink failure" } });
    await prisma.mediaAsset.update({ where: { id: uploadResult.asset.id }, data: { deletionPending: true } });
    response = await retry.POST(request("/api/admin/media/deletion-jobs/retry", "POST"));
    assert.equal(response.status, 200); assert.equal((await response.json() as { removed: number }).removed, 1);
    await assert.rejects(access(cleanupFile));
    assert.equal(await prisma.mediaDeletionJob.findUnique({ where: { id: failedJob.id } }), null);
    console.log("PASS: upload registration and failed deletion job retry remove physical file");

    response = await folders.POST(request("/api/admin/media/folders", "POST", JSON.stringify({ action: "delete", id: childFolder.id, name: `Renamed ${suffix}` }), "application/json"));
    assert.equal(response.status, 200);
    response = await folders.POST(request("/api/admin/media/folders", "POST", JSON.stringify({ action: "delete", id: rootFolder.id, name: `M006 ${suffix}` }), "application/json"));
    assert.equal(response.status, 200);
    console.log("PASS: empty child and parent folder deletion");
  } finally {
    try {
      const cleanupIdentity = await prisma.$queryRaw<Array<{ db: string }>>`SELECT DATABASE() AS db`;
      assert.equal(cleanupIdentity[0]?.db, TARGET_DB, "Refusing cleanup outside isolated database");
      await prisma.mediaReference.deleteMany({ where: { productId: { in: productIds } } });
      await prisma.mediaDeletionJob.deleteMany({ where: { mediaId: { in: assetIds } } });
      await prisma.mediaAsset.deleteMany({ where: { id: { in: assetIds } } });
      await prisma.product.deleteMany({ where: { id: { in: productIds } } });
      for (const id of folderIds.reverse()) await prisma.mediaFolder.deleteMany({ where: { id } });
      const [assetsLeft, foldersLeft, productsLeft, refsLeft] = await Promise.all([
        prisma.mediaAsset.count({ where: { id: { in: assetIds } } }),
        prisma.mediaFolder.count({ where: { id: { in: folderIds } } }),
        prisma.product.count({ where: { id: { in: productIds } } }),
        prisma.mediaReference.count({ where: { productId: { in: productIds } } }),
      ]);
      assert.deepEqual([assetsLeft, foldersLeft, productsLeft, refsLeft], [0, 0, 0, 0], "Fixture cleanup verification failed");
      console.log("DATABASE CLEANUP PASS: generated fixture records removed");
    } finally {
      if (storageDir) await rm(storageDir, { recursive: true, force: true });
      if (storageDir) await assert.rejects(access(storageDir));
      console.log("FILESYSTEM CLEANUP PASS: temporary media files removed");
      if (routePrisma) await routePrisma.$disconnect();
      await prisma.$disconnect();
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousDatabaseUrl;
      if (previousMediaStorageDir === undefined) delete process.env.MEDIA_STORAGE_DIR; else process.env.MEDIA_STORAGE_DIR = previousMediaStorageDir;
    }
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { loader._load = originalLoad; });
