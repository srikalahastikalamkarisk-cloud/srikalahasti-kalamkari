import { access, mkdir, realpath, stat } from "node:fs/promises";
import path from "node:path";

export async function mediaStorageRoot() {
  const configured = process.env.MEDIA_STORAGE_DIR?.trim();
  if (!configured || !path.isAbsolute(configured)) throw new Error("Set MEDIA_STORAGE_DIR to an absolute persistent directory");
  const root = await realpath(configured).catch(() => { throw new Error("MEDIA_STORAGE_DIR must exist before use"); });
  const releaseRoot = await realpath(process.cwd());
  if (root === releaseRoot || root.startsWith(`${releaseRoot}${path.sep}`)) throw new Error("MEDIA_STORAGE_DIR must be outside the application release directory");
  const rootStats = await stat(root);
  if (!rootStats.isDirectory() || (rootStats.mode & 0o022) !== 0) throw new Error("MEDIA_STORAGE_DIR must be a directory that is not group- or world-writable");
  await access(root, 2).catch(() => { throw new Error("Application process cannot write to MEDIA_STORAGE_DIR"); });
  const products = path.join(root, "products");
  await mkdir(products, { recursive: true, mode: 0o750 });
  const resolvedProducts = await realpath(products);
  if (!resolvedProducts.startsWith(`${root}${path.sep}`)) throw new Error("Media products directory escapes MEDIA_STORAGE_DIR");
  const productStats = await stat(resolvedProducts);
  if (!productStats.isDirectory() || (productStats.mode & 0o022) !== 0) throw new Error("Products storage directory must not be group- or world-writable");
  await access(resolvedProducts, 2).catch(() => { throw new Error("Application process cannot write to products storage"); });
  return root;
}

export async function confinedMediaPath(storageKey: string) {
  if (!/^[a-f0-9-]{36}\.(jpg|png|webp)$/.test(storageKey)) throw new Error("Invalid media storage key");
  const root = await mediaStorageRoot();
  const directory = await realpath(path.join(root, "products"));
  const target = path.resolve(directory, storageKey);
  if (!target.startsWith(`${directory}${path.sep}`)) throw new Error("Media path escapes storage directory");
  return { root, directory, target };
}
