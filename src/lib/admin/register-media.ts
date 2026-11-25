import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { confinedMediaPath } from "./media-storage";
import { Prisma } from "@/generated/prisma/client";
import { assertManagedMediaAvailable, queueReleasedMedia } from "./global-media-references";

const MEDIA_URL = /^\/api\/media\/products\/([a-f0-9-]{36}\.(?:jpg|png|webp))$/;

export async function registerProductImages(
  tx: Prisma.TransactionClient,
  productId: string,
  images: string[],
  photoNumbers: string[] = [],
) {
  await assertManagedMediaAvailable(tx, images);
  const canonical: string[] = [];
  const duplicateUploads: string[] = [];
  const attachedMediaIds = new Set<string>();
  const expectedMediaIds = new Set<string>();
  for (const [sortOrder, image] of images.entries()) {
    const match = MEDIA_URL.exec(image);
    if (!match) { canonical.push(image); continue; }
    const storageKey = match[1];
    const { target } = await confinedMediaPath(storageKey);
    const bytes = await readFile(target);
    const checksum = createHash("sha256").update(bytes).digest("hex");
    const existing = await tx.mediaAsset.findUnique({ where: { checksum } });
    if (existing) await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM MediaAsset WHERE id = ${existing.id} FOR UPDATE`;
    const fresh = existing
      ? await tx.mediaAsset.findUnique({
          where: { id: existing.id }
        })
      : null;

    if (existing && (!fresh || fresh.deletionPending)) {
      throw new Error(
        "This image is being removed. Please upload it again."
      );
    }

    const asset = fresh ?? await tx.mediaAsset.create({ data: {
      storageKey, filename: storageKey, mimeType: storageKey.endsWith(".jpg") ? "image/jpeg" : storageKey.endsWith(".png") ? "image/png" : "image/webp",
      sizeBytes: bytes.length, checksum, photoNumber: photoNumbers[sortOrder] ?? null,
    } });
    if (asset.storageKey !== storageKey) duplicateUploads.push(image);
    if (attachedMediaIds.has(asset.id)) continue;
    attachedMediaIds.add(asset.id);
    expectedMediaIds.add(asset.id);
    const reference = await tx.mediaReference.findFirst({ where: { mediaId: asset.id, productId, placement: "PRODUCT" }, select: { id: true } });
    if (reference) await tx.mediaReference.update({ where: { id: reference.id }, data: { placementId: productId, sortOrder } });
    else await tx.mediaReference.create({ data: { mediaId: asset.id, productId, placement: "PRODUCT", placementId: productId, sortOrder } });
    canonical.push(`/api/media/products/${asset.storageKey}`);
  }
  await tx.mediaReference.deleteMany({
    where: {
      productId,
      placement: "PRODUCT",
      ...(expectedMediaIds.size ? { mediaId: { notIn: [...expectedMediaIds] } } : {}),
    },
  });
  if (canonical.length !== images.length || canonical.some((image, index) => image !== images[index])) {
    await tx.product.update({ where: { id: productId }, data: { images: canonical as Prisma.InputJsonValue } });
  }
  if (duplicateUploads.length) await queueReleasedMedia(tx, duplicateUploads, []);
}
