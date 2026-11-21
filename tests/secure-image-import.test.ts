import test from "node:test";
import assert from "node:assert/strict";
import { validatePhotoNumbers, downloadProductImage, fetchProductImage, validateProductImageCount } from "../src/lib/admin/secure-image-import";
import { mkdtemp, chmod, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("photo numbers preserve order and reject duplicate or nonnumeric values", () => {
  assert.deepEqual(validatePhotoNumbers("101, 102,103"), ["101", "102", "103"]);
  assert.throws(() => validatePhotoNumbers("101,101"), /duplicates/);
  assert.throws(() => validatePhotoNumbers("101,a"), /numbers/);
});

test("image count enforces the existing 20-image product limit", () => {
  assert.equal(validateProductImageCount(17, 3), 20);
  assert.throws(() => validateProductImageCount(18, 3), /at most 20 images/);
});

test("image downloader requires configured absolute persistent storage and HTTPS", async () => {
  const old = process.env.MEDIA_STORAGE_DIR;
  try {
    delete process.env.MEDIA_STORAGE_DIR;
    await assert.rejects(downloadProductImage("https://example.org/a.jpg", async () => { throw new Error("network must not be called"); }), /absolute persistent directory/);
    const directory = await mkdtemp(path.join(os.tmpdir(), "sk-img-test-"));
    try {
      await chmod(directory, 0o750);
      process.env.MEDIA_STORAGE_DIR = directory;
      await assert.rejects(downloadProductImage("http://127.0.0.1/a.jpg", async () => { throw new Error("network must not be called"); }), /public HTTPS/);
    } finally { await rm(directory, { recursive: true, force: true }); }
  } finally {
    if (old === undefined) delete process.env.MEDIA_STORAGE_DIR;
    else process.env.MEDIA_STORAGE_DIR = old;
  }
});

test("remote image fetch checks actual image format and manually validates redirects", async () => {
  const png = new Uint8Array([137,80,78,71,13,10,26,10]);
  const image = await fetchProductImage("https://1.1.1.1/image.png", async (_url, init) => {
    assert.equal(init?.redirect, "manual");
    return new Response(png, { headers: { "content-type": "image/png" } });
  });
  assert.equal(image.mime, "image/png");

  let requests = 0;
  await assert.rejects(fetchProductImage("https://1.1.1.1/redirect", async () => {
    requests++;
    return new Response(null, { status: 302, headers: { location: "https://127.0.0.1/private" } });
  }), /private or reserved/);
  assert.equal(requests, 1);

  await assert.rejects(fetchProductImage("https://1.1.1.1/wrong-type", async () =>
    new Response(png, { headers: { "content-type": "text/plain" } })
  ), /supported JPG/);
});
