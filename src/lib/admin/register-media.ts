import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { confinedMediaPath } from "./media-storage";
import { Prisma } from "@/generated/prisma/client";

const MEDIA_URL = /^\/api\/media\/products\/([a-f0-9-]{36}\.(?:jpg|png|webp))$/;

export async function registerProductImages(
  tx: Prisma.TransactionClient,
  productId: string,
  images: string[],
  photoNumbers: string[] = [],
) {
  const canonical: string[] = [];
  const attachedMediaIds = new Set<string>();
  for (const [sortOrder, image] of images.entries()) {
    const match = MEDIA_URL.exec(image);
    if (!match) { canonical.push(image); continue; }
    const storageKey = match[1];
    const { target } = await confinedMediaPath(storageKey);
    const bytes = await readFile(target);
    const checksum = createHash("sha256").update(bytes).digest("hex");
    const existing = await tx.mediaAsset.findUnique({ where: { checksum } });
    if (existing) await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM MediaAsset WHERE id = ${existing.id} FOR UPDATE`;
    const asset = existing ?? await tx.mediaAsset.create({ data: {
      storageKey, filename: storageKey, mimeType: storageKey.endsWith(".jpg") ? "image/jpeg" : storageKey.endsWith(".png") ? "image/png" : "image/webp",
      sizeBytes: bytes.length, checksum, photoNumber: photoNumbers[sortOrder] ?? null,
    } });
    if (attachedMediaIds.has(asset.id)) continue;
    attachedMediaIds.add(asset.id);
    await tx.mediaReference.create({ data: { mediaId: asset.id, productId, placement: "PRODUCT", placementId: productId, sortOrder } });
    canonical.push(`/api/media/products/${asset.storageKey}`);
  }
  if (canonical.length !== images.length || canonical.some((image, index) => image !== images[index])) {
    await tx.product.update({ where: { id: productId }, data: { images: canonical as Prisma.InputJsonValue } });
  }
}
