import test from "node:test";
import assert from "node:assert/strict";
import { inspectFaviconImage, MAX_FAVICON_BYTES } from "../src/lib/favicon-image";

function png(width: number, height: number) {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82], 0);
  new DataView(bytes.buffer).setUint32(16, width, false);
  new DataView(bytes.buffer).setUint32(20, height, false);
  return bytes;
}

test("favicon validation accepts a square PNG with the matching declared type", () => {
  assert.deepEqual(inspectFaviconImage(png(64, 64), "image/png", "mark.png"), {
    extension: "png", mimeType: "image/png", width: 64, height: 64,
  });
});

test("favicon validation rejects mismatched MIME, non-square and out-of-range dimensions", () => {
  assert.equal(inspectFaviconImage(png(64, 64), "image/jpeg", "mark.jpg"), null);
  assert.equal(inspectFaviconImage(png(64, 32), "image/png", "mark.png"), null);
  assert.equal(inspectFaviconImage(png(1024, 1024), "image/png", "mark.png"), null);
  assert.equal(inspectFaviconImage(new Uint8Array(0), "image/png", "mark.png"), null);
});

test("favicon validation enforces the byte limit before parsing", () => {
  assert.equal(inspectFaviconImage(new Uint8Array(MAX_FAVICON_BYTES + 1), "image/png", "large.png"), null);
});
