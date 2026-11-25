import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { NextRequest } from "next/server";
import { createPersistentImageUploadHandler } from "../src/lib/admin/persistent-image-upload";
import { confinedMediaPath } from "../src/lib/admin/media-storage";
import { GET as getProduct } from "../src/app/api/media/products/[filename]/route";
import { GET as getCategory } from "../src/app/api/media/categories/[filename]/route";

const IDS = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
];

function uploadRequest(origin: string, png: Uint8Array) {
  const form = new FormData();
  const bytes = new ArrayBuffer(png.byteLength);
  new Uint8Array(bytes).set(png);
  form.set("file", new File([bytes], "fixture.png", { type: "image/png" }));
  return new NextRequest(`${origin}/api/admin/upload`, { method: "POST", headers: { origin, "content-length": "1024" }, body: form });
}

test("authenticated product/category uploads persist, preview and replacement use isolated storage", async () => {
  const PNG = await sharp({ create: { width: 1, height: 1, channels: 4, background: { r: 180, g: 40, b: 70, alpha: 1 } } }).png().toBuffer();
  const root = await mkdtemp(path.join(os.tmpdir(), "sk-media-test-"));
  const oldRoot = process.env.MEDIA_STORAGE_DIR;
  const oldAppBaseUrl = process.env.APP_BASE_URL;
  const origin = "https://test.local";
  try {
    process.env.MEDIA_STORAGE_DIR = root;
    process.env.APP_BASE_URL = origin;
    for (const area of ["products", "categories", "hero-videos", "story-videos"]) await mkdir(path.join(root, area));
    const admin = async () => ({ id: "isolated-admin-fixture" });
    let idIndex = 0;
    const handler = (area: "products" | "categories") => createPersistentImageUploadHandler({
      area,
      getCurrentAdmin: admin,
      getStorageRoot: async () => root,
      createId: () => IDS[idIndex++],
    });

    for (const area of ["products", "categories"] as const) {
      const upload = handler(area);
      const first = await upload(uploadRequest(origin, PNG));
      assert.equal(first.status, 201);
      const firstBody = await first.json() as { image: string; filename: string };
      assert.match(firstBody.filename, /^[a-f0-9-]{36}\.(jpg|png|webp)$/);
      assert.equal(firstBody.image, `/api/media/${area}/${firstBody.filename}`);
      const firstStored = await readFile(path.join(root, area, firstBody.filename));
      assert.ok((await sharp(firstStored).metadata()).format, "stored optimized image must remain decodable");

      const routeGet = area === "products" ? getProduct : getCategory;
      await confinedMediaPath(firstBody.filename, area);
      const preview = await routeGet(new NextRequest(`${origin}${firstBody.image}`), { params: Promise.resolve({ filename: firstBody.filename }) });
      assert.equal(preview.status, 200);
      assert.match(preview.headers.get("content-type") ?? "", /^image\/(png|webp|jpeg)/);
      assert.deepEqual(Buffer.from(await preview.arrayBuffer()), firstStored, "preview must return the exact stored optimized image");

      const second = await upload(uploadRequest(origin, PNG));
      assert.equal(second.status, 201);
      const secondBody = await second.json() as { image: string; filename: string };
      assert.notEqual(secondBody.filename, firstBody.filename);
      assert.deepEqual(await readFile(path.join(root, area, firstBody.filename)), firstStored, "replacement must retain the previous image");
      assert.ok((await sharp(await readFile(path.join(root, area, secondBody.filename))).metadata()).format, "replacement image must remain decodable");
    }
  } finally {
    if (oldRoot === undefined) delete process.env.MEDIA_STORAGE_DIR;
    else process.env.MEDIA_STORAGE_DIR = oldRoot;
    if (oldAppBaseUrl === undefined) delete process.env.APP_BASE_URL;
    else process.env.APP_BASE_URL = oldAppBaseUrl;
    await rm(root, { recursive: true, force: true });
  }
});

test("persistent image upload rejects unauthenticated and cross-origin requests", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sk-media-deny-"));
  try {
    const handler = createPersistentImageUploadHandler({ area: "products", getCurrentAdmin: async () => null, getStorageRoot: async () => root });
    const png = await sharp({ create: { width: 1, height: 1, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
    assert.equal((await handler(uploadRequest("https://test.local", png))).status, 401);
    const authenticated = createPersistentImageUploadHandler({ area: "products", getCurrentAdmin: async () => ({ id: "isolated-admin-fixture" }), getStorageRoot: async () => root });
    const crossOrigin = new NextRequest("https://test.local/api/admin/upload", { method: "POST", headers: { origin: "https://attacker.invalid", "content-length": "1024" }, body: new FormData() });
    assert.equal((await authenticated(crossOrigin)).status, 403);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
