import { detectExtendedImage } from "@/lib/admin/extended-image-format";
import { optimizeImage } from "@/lib/admin/image-optimizer";
import { NextRequest, NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { validOrigin } from "@/lib/admin/origin";
import { mediaStorageRoot } from "@/lib/admin/media-storage";
import { inspectFaviconImage, MAX_FAVICON_BYTES } from "@/lib/favicon-image";
import { lockMediaMutation } from "@/lib/admin/media-mutation-lock";
import { queueReleasedMedia } from "@/lib/admin/global-media-references";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_SIZE = 5 * 1024 * 1024;

function detect(bytes: Uint8Array) {
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return { ext: "jpg", mime: "image/jpeg" };
  if (bytes.length >= 8 && Buffer.from(bytes.slice(0, 8)).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return { ext: "png", mime: "image/png" };
  if (bytes.length >= 12 && Buffer.from(bytes.slice(0,4)).toString() === "RIFF" && Buffer.from(bytes.slice(8,12)).toString() === "WEBP") return { ext: "webp", mime: "image/webp" };
  return null;
}

export async function GET(req: NextRequest) {
  if (!await getCurrentAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const folderId = req.nextUrl.searchParams.get("folderId");
  const rawPage = req.nextUrl.searchParams.get("page");
  const paginated = rawPage !== null;
  const page = paginated ? Number(rawPage) : 1;
  const pageSize = 48;

  if (!Number.isSafeInteger(page) || page < 1 || page > 10000) {
    return NextResponse.json(
      { error: "Invalid media page" },
      { status: 400 }
    );
  }

  const assets = await prisma.mediaAsset.findMany({
    ...(paginated
      ? { skip: (page - 1) * pageSize, take: pageSize + 1 }
      : {}),
    where: { deletionPending: false, ...(folderId ? { folderId } : {}), ...(q ? { OR: [{ filename: { contains: q } }, { photoNumber: { contains: q } }] } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: { folder: { select: { id: true, name: true } }, references: { include: { product: { select: { id: true, name: true, slug: true } } } } },
  });
  return NextResponse.json({
    assets: paginated ? assets.slice(0, pageSize) : assets,
    page,
    hasMore: paginated && assets.length > pageSize
  }, {
    headers: { "Cache-Control": "private, no-store" }
  });
}

export async function POST(req: NextRequest) {
  if (!await getCurrentAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!validOrigin(req)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const announcedLength = Number(req.headers.get("content-length") ?? "0");
  if (
    !Number.isSafeInteger(announcedLength) ||
    announcedLength < 1 ||
    announcedLength > MAX_SIZE + 128 * 1024
  ) return NextResponse.json({ error: "Upload is too large" }, { status: 413 });
  let root: string;
  try { root = await mediaStorageRoot(); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Persistent media storage is unavailable" }, { status: 503 }); }
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const folderId = form?.get("folderId");
  const purpose = form?.get("purpose");
  const isFavicon = purpose === "favicon";
  const maxSize = isFavicon ? MAX_FAVICON_BYTES : MAX_SIZE;
  if (purpose !== null && purpose !== "favicon" && purpose !== "logo") return NextResponse.json({ error: "Invalid upload purpose" }, { status: 400 });
  if (!(file instanceof File) || file.size < 1 || file.size > maxSize) return NextResponse.json({ error: isFavicon ? "Choose a favicon up to 1 MB" : "Choose an image up to 5 MB" }, { status: 400 });
  let bytes: Uint8Array = new Uint8Array(await file.arrayBuffer());
  const favicon = isFavicon ? inspectFaviconImage(bytes, file.type, file.name) : null;
  let type = favicon ? { ext: favicon.extension, mime: favicon.mimeType } : isFavicon ? null : (detect(bytes) ?? detectExtendedImage(bytes));
  if (!type || (!isFavicon && file.type !== type.mime)) {
    return NextResponse.json({ error: isFavicon ? "Use a valid square PNG, JPG, WebP or ICO from 16 to 512 pixels" : "Only valid JPG, PNG, WebP, TIFF and AVIF images are accepted" }, { status: 400 });
  }
  const originalSize = bytes.byteLength;

  if (!isFavicon) {
    try {
      const optimized = await optimizeImage(bytes, purpose === "logo" ? "logo" : "general");
      bytes = optimized.bytes;
      type = {
        ext: optimized.extension,
        mime: optimized.mime
      };
    } catch {
      return NextResponse.json({
        error: "Image optimization failed. Check image quality, format or retry shortly."
      }, { status: 422 });
    }
  }

  const checksum = createHash("sha256").update(bytes).digest("hex");
  const duplicate = await prisma.mediaAsset.findUnique({ where: { checksum } });
  if (duplicate) {
    if (isFavicon && !duplicate.deletionPending && duplicate.storageKey.endsWith(`.${type.ext}`)) {
      return NextResponse.json({ success: true, asset: duplicate, reused: true });
    }
    return NextResponse.json({ error: "This image is already in the library", assetId: duplicate.id }, { status: 409 });
  }
  if (typeof folderId === "string" && folderId) {
    if (!await prisma.mediaFolder.findUnique({ where: { id: folderId }, select: { id: true } })) return NextResponse.json({ error: "Folder not found" }, { status: 400 });
  }
  const storageKey = `${randomUUID()}.${type.ext}`;
  const directory = path.join(root, "products");
  await writeFile(path.join(directory, storageKey), bytes, { flag: "wx", mode: 0o640 });
  try {
    const asset = await prisma.mediaAsset.create({ data: { storageKey, filename: file.name.slice(0,255), mimeType: type.mime, sizeBytes: bytes.length, checksum, folderId: typeof folderId === "string" && folderId ? folderId : null } });
    return NextResponse.json({
      success: true,
      asset,
      originalSize,
      optimizedSize: bytes.byteLength
    }, { status: 201 });
  } catch {
    try {
      await prisma.$transaction(async tx => {
        await lockMediaMutation(tx);
        await queueReleasedMedia(tx, `/api/media/products/${storageKey}`, null);
      });
    } catch { /* Keep the orphan on disk for the read-only storage audit if queueing is unavailable. */ }
    return NextResponse.json({ error: "Image registration failed; stored file was queued for safe cleanup when possible" }, { status: 500 });
  }
}
