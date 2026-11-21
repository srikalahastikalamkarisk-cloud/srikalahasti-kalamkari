import { NextRequest, NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { validOrigin } from "@/lib/admin/origin";
import { mediaStorageRoot } from "@/lib/admin/media-storage";

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
  const assets = await prisma.mediaAsset.findMany({
    where: { deletionPending: false, ...(folderId ? { folderId } : {}), ...(q ? { OR: [{ filename: { contains: q } }, { photoNumber: { contains: q } }] } : {}) },
    orderBy: { createdAt: "desc" },
    include: { folder: { select: { id: true, name: true } }, references: { include: { product: { select: { id: true, name: true, slug: true } } } } },
  });
  return NextResponse.json({ assets });
}

export async function POST(req: NextRequest) {
  if (!await getCurrentAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!validOrigin(req)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  let root: string;
  try { root = await mediaStorageRoot(); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Persistent media storage is unavailable" }, { status: 503 }); }
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const folderId = form?.get("folderId");
  if (!(file instanceof File) || file.size < 1 || file.size > MAX_SIZE) return NextResponse.json({ error: "Choose an image up to 5 MB" }, { status: 400 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = detect(bytes);
  if (!type || file.type !== type.mime) return NextResponse.json({ error: "Only valid JPG, PNG and WebP images are accepted" }, { status: 400 });
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const duplicate = await prisma.mediaAsset.findUnique({ where: { checksum } });
  if (duplicate) return NextResponse.json({ error: "This image is already in the library", assetId: duplicate.id }, { status: 409 });
  if (typeof folderId === "string" && folderId) {
    if (!await prisma.mediaFolder.findUnique({ where: { id: folderId }, select: { id: true } })) return NextResponse.json({ error: "Folder not found" }, { status: 400 });
  }
  const storageKey = `${randomUUID()}.${type.ext}`;
  const directory = path.join(root, "products");
  await writeFile(path.join(directory, storageKey), bytes, { flag: "wx", mode: 0o640 });
  try {
    const asset = await prisma.mediaAsset.create({ data: { storageKey, filename: file.name.slice(0,255), mimeType: type.mime, sizeBytes: bytes.length, checksum, folderId: typeof folderId === "string" && folderId ? folderId : null } });
    return NextResponse.json({ success: true, asset }, { status: 201 });
  } catch {
    await unlink(path.join(directory, storageKey)).catch(() => undefined);
    return NextResponse.json({ error: "Image registration failed; stored file may need cleanup" }, { status: 500 });
  }
}
