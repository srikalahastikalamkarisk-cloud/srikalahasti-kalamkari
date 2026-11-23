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
  for (const area of ["products", "categories", "hero-videos", "story-videos"]) {
    const directory = path.join(root, area);
    await mkdir(directory, { recursive: true, mode: 0o750 });
    const resolvedDirectory = await realpath(directory);
    if (!resolvedDirectory.startsWith(`${root}${path.sep}`)) throw new Error(`Media ${area} directory escapes MEDIA_STORAGE_DIR`);
    const directoryStats = await stat(resolvedDirectory);
    if (!directoryStats.isDirectory() || (directoryStats.mode & 0o022) !== 0) throw new Error(`Media ${area} directory must not be group- or world-writable`);
    await access(resolvedDirectory, 2).catch(() => { throw new Error(`Application process cannot write to ${area} storage`); });
  }
  return root;
}

export type MediaStorageArea = "products" | "categories" | "hero-videos" | "story-videos";

export async function confinedMediaPath(storageKey: string, area: MediaStorageArea = "products") {
  const allowed = area === "products" ? /\.(jpg|png|webp|ico)$/ : area === "categories" ? /\.(jpg|png|webp)$/ : /\.(mp4|webm)$/;
  if (!/^[a-f0-9-]{36}\.[a-z0-9]+$/.test(storageKey) || !allowed.test(storageKey)) throw new Error("Invalid media storage key");
  const root = await mediaStorageRoot();
  const directory = await realpath(path.join(root, area));
  const target = path.resolve(directory, storageKey);
  if (!target.startsWith(`${directory}${path.sep}`)) throw new Error("Media path escapes storage directory");
  return { root, directory, target };
}
