import { createHash, randomUUID } from "node:crypto";
import {
  mkdir, readFile, writeFile,
  rename, rm, readdir, stat, lstat
} from "node:fs/promises";
import path from "node:path";
import { fetchProductImage } from "./secure-image-import";

const MAX_CACHE_BYTES = 500 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type Extension = "jpg" | "png" | "webp";

const MIME = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp"
} as const;

export async function createImportImageCache(
  csvPath: string
) {
  const directory = path.join(
    path.dirname(csvPath),
    "remote-images"
  );

  await mkdir(directory, {
    recursive: true,
    mode: 0o700
  });

  const info = await lstat(directory);

  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    (info.mode & 0o077) !== 0
  ) {
    throw new Error("Unsafe import cache directory");
  }

  let cachedBytes = 0;

  for (const name of await readdir(directory)) {
    if (!/^[a-f0-9]{64}\.(jpg|png|webp)$/.test(name)) {
      continue;
    }

    const entry = await lstat(
      path.join(directory, name)
    );

    if (!entry.isFile() || entry.isSymbolicLink()) {
      throw new Error("Invalid image cache entry");
    }

    cachedBytes += entry.size;
  }

  if (cachedBytes > MAX_CACHE_BYTES) {
    throw new Error("Image cache exceeds 500 MB");
  }

  return async function getImage(url: string) {
    const key = createHash("sha256")
      .update(url)
      .digest("hex");

    for (const extension of [
      "jpg", "png", "webp"
    ] as Extension[]) {
      const filename = path.join(
        directory,
        `${key}.${extension}`
      );

      const entry = await stat(filename).catch(error => {
        if (error.code === "ENOENT") return null;
        throw error;
      });

      if (!entry) continue;

      if (
        !entry.isFile() ||
        entry.size < 1 ||
        entry.size > MAX_IMAGE_BYTES
      ) {
        throw new Error("Invalid cached image");
      }

      const bytes = await readFile(filename);

      return {
        bytes,
        extension,
        mime: MIME[extension]
      };
    }

    if (cachedBytes >= MAX_CACHE_BYTES) {
      throw new Error("Image cache limit reached");
    }

    const image = await fetchProductImage(url);

    if (
      cachedBytes + image.bytes.byteLength >
      MAX_CACHE_BYTES
    ) {
      throw new Error(
        "Total cached images exceed 500 MB"
      );
    }

    const filename = path.join(
      directory,
      `${key}.${image.extension}`
    );

    const temporary = path.join(
      directory,
      `.temporary-${randomUUID()}`
    );

    try {
      await writeFile(temporary, image.bytes, {
        flag: "wx",
        mode: 0o600
      });

      await rename(temporary, filename);
      cachedBytes += image.bytes.byteLength;
    } finally {
      await rm(temporary, { force: true });
    }

    return image;
  };
}
