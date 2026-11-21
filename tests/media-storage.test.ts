import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, chmod, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mediaStorageRoot, confinedMediaPath } from "../src/lib/admin/media-storage";

test("storage preflight rejects missing and release-local storage", async () => {
  const original = process.env.MEDIA_STORAGE_DIR;
  try {
    delete process.env.MEDIA_STORAGE_DIR;
    await assert.rejects(mediaStorageRoot(), /absolute persistent directory/);
    process.env.MEDIA_STORAGE_DIR = process.cwd();
    await assert.rejects(mediaStorageRoot(), /outside the application release/);
  } finally { if (original === undefined) delete process.env.MEDIA_STORAGE_DIR; else process.env.MEDIA_STORAGE_DIR = original; }
});

test("storage accepts a confined dedicated directory and rejects unsafe keys", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "sk-media-test-"));
  const original = process.env.MEDIA_STORAGE_DIR;
  try {
    await chmod(directory, 0o750);
    process.env.MEDIA_STORAGE_DIR = directory;
    assert.equal(await mediaStorageRoot(), await (async () => (await import("node:fs/promises")).realpath(directory))());
    await assert.rejects(confinedMediaPath("../secret.jpg"), /Invalid media storage key/);
  } finally {
    if (original === undefined) delete process.env.MEDIA_STORAGE_DIR; else process.env.MEDIA_STORAGE_DIR = original;
    await rm(directory, { recursive: true, force: true });
  }
});
