import { optimizeImage } from "./image-optimizer";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { mediaStorageRoot } from "./media-storage";
import { confinedMediaPath } from "./media-storage";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_PRODUCT_IMAGES = 20;

export function validateProductImageCount(urlCount: number, photoNumberCount: number) {
  const count = urlCount + photoNumberCount;
  if (!Number.isInteger(count) || count < 0 || count > MAX_PRODUCT_IMAGES) {
    throw new Error(`A product may have at most ${MAX_PRODUCT_IMAGES} images`);
  }
  return count;
}

const STORED_PRODUCT_IMAGE = /^\/api\/media\/products\/([a-f0-9-]{36}\.(?:jpg|png|webp))$/;

export function isStoredProductImage(value: string) {
  return STORED_PRODUCT_IMAGE.test(value);
}

export async function readStoredProductImage(value: string) {
  const match = STORED_PRODUCT_IMAGE.exec(value);
  if (!match) throw new Error("Invalid stored product image path");
  const { target } = await confinedMediaPath(match[1]);
  const bytes = await readFile(target);
  const type = imageType(bytes);
  if (!type || bytes.byteLength > MAX_IMAGE_BYTES) throw new Error("Stored product image is invalid or too large");
  return { bytes, extension: type.ext, mime: type.mime };
}

function publicAddress(address: string) {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127));
  }
  const ip = address.toLowerCase();
  return ip === "::1" || ip === "::" || ip.startsWith("fc") ||
    ip.startsWith("fd") || /^fe[89ab]/.test(ip) || ip.startsWith("::ffff:") ? false : true;
}

async function validateRemote(url: URL) {
  if (url.protocol !== "https:" || url.username || url.password || !url.hostname) throw new Error("Image URLs must be public HTTPS URLs");
  const records = isIP(url.hostname) ? [{ address: url.hostname }] : await lookup(url.hostname, { all: true, verbatim: true });
  if (!records.length || records.some(record => !publicAddress(record.address))) throw new Error("Image URL resolves to a private or reserved address");
}

function imageType(data: Uint8Array): { ext: "jpg" | "png" | "webp"; mime: string } | null {
  if (data.length >= 3 && data[0] === 255 && data[1] === 216 && data[2] === 255) return { ext: "jpg", mime: "image/jpeg" };
  if (data.length >= 8 && data[0] === 137 && data[1] === 80 && data[2] === 78 && data[3] === 71 && data[4] === 13 && data[5] === 10 && data[6] === 26 && data[7] === 10) return { ext: "png", mime: "image/png" };
  if (data.length >= 12 && String.fromCharCode(...data.slice(0, 4)) === "RIFF" && String.fromCharCode(...data.slice(8, 12)) === "WEBP") return { ext: "webp", mime: "image/webp" };
  return null;
}

export async function fetchProductImage(rawUrl: string, fetcher: typeof fetch = fetch) {
  let url = new URL(rawUrl);
  let response: Response | undefined;
  for (let hop = 0; hop <= 3; hop++) {
    await validateRemote(url);
    response = await fetcher(url, { redirect: "manual", signal: AbortSignal.timeout(12000), headers: { Accept: "image/jpeg,image/png,image/webp" } });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get("location");
    if (!location || hop === 3) throw new Error("Image redirect limit exceeded");
    url = new URL(location, url);
  }
  if (!response?.ok || !response.body) throw new Error(`Image download failed (${response?.status ?? "no response"})`);
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > MAX_IMAGE_BYTES) throw new Error("Image exceeds 5 MB");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    total += part.value.byteLength;
    if (total > MAX_IMAGE_BYTES) { await reader.cancel(); throw new Error("Image exceeds 5 MB"); }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const type = imageType(bytes);
  if (!type || response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== type.mime) throw new Error("Downloaded content is not a supported JPG, PNG, or WebP image");
  return { bytes, extension: type.ext, mime: type.mime };
}

export async function downloadProductImage(rawUrl: string, fetcher: typeof fetch = fetch) {
  const configuredDir = await mediaStorageRoot();
  const image = await fetchProductImage(rawUrl, fetcher);
  return saveProductImage(image.bytes, image.extension, configuredDir);
}

export async function saveProductImage(bytes: Uint8Array, extension: "jpg" | "png" | "webp", configuredDir = process.env.MEDIA_STORAGE_DIR?.trim()) {
  const safeRoot = await mediaStorageRoot();
  if (configuredDir && path.resolve(configuredDir) !== safeRoot) throw new Error("Image destination does not match the configured persistent storage root");
  const type = imageType(bytes);
  if (!type || type.ext !== extension || bytes.byteLength > MAX_IMAGE_BYTES) throw new Error("ZIP image content or size is invalid");
  const directory = path.join(safeRoot, "products");
  await mkdir(directory, { recursive: true, mode: 0o750 });
  const optimized = await optimizeImage(bytes, "product");
  const filename = `${randomUUID()}.${optimized.extension}`;

  await writeFile(
    path.join(directory, filename),
    optimized.bytes,
    { flag: "wx", mode: 0o640 }
  );
  return `/api/media/products/${filename}`;
}

export function validatePhotoNumbers(csv: string) {
  const values = csv.split(",").map(value => value.trim()).filter(Boolean);
  if (new Set(values).size !== values.length) throw new Error("Photo Numbers contains duplicates");
  if (values.some(value => !/^\d+$/.test(value))) throw new Error("Photo Numbers must be comma-separated numbers");
  return values;
}
