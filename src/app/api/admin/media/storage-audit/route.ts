import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { mediaStorageRoot, type MediaStorageArea } from "@/lib/admin/media-storage";
import { collectProtectedMedia, parseManagedMedia } from "@/lib/admin/global-media-references";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const areas: MediaStorageArea[] = ["products", "categories", "hero-videos", "story-videos"];

async function checksumFile(file: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

export async function GET() {
  if (!await getCurrentAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const root = await mediaStorageRoot();
    const protectedUrls = await prisma.$transaction(tx => collectProtectedMedia(tx), { isolationLevel: "ReadCommitted", timeout: 20000 });
    const referencedKeys = new Set([...protectedUrls].map(url => parseManagedMedia(url)?.storageKey).filter(Boolean));
    const libraryAssets = await prisma.mediaAsset.findMany({ where: { folderId: { not: null } }, select: { storageKey: true } });
    const libraryKeys = new Set(libraryAssets.map(asset => asset.storageKey));
    const jobs = await prisma.mediaCleanupJob.findMany({ where: { status: { in: ["PENDING", "PROCESSING", "FAILED", "PROTECTED", "DEAD"] } }, select: { id: true, storageKey: true, status: true, attempts: true } });
    const files: Array<{ area: MediaStorageArea; key: string; bytes: number; checksum: string }> = [];
    const missing: string[] = [];
    for (const area of areas) {
      const directory = path.join(root, area);
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (!entry.isFile() || entry.isSymbolicLink()) continue;
        const key = entry.name;
        if (!/^[a-f0-9-]{36}\.(jpg|jpeg|png|webp|ico|mp4|webm)$/i.test(key)) continue;
        const full = path.join(directory, key);
        const info = await lstat(full);
        if (!info.isFile() || info.isSymbolicLink()) continue;
        const digest = await checksumFile(full);
        files.push({ area, key, bytes: info.size, checksum: digest });
      }
    }
    const diskKeys = new Set(files.map(file => `${file.area}/${file.key}`));
    for (const url of protectedUrls) {
      const media = parseManagedMedia(url);
      if (media && !diskKeys.has(`${media.area}/${media.storageKey}`)) missing.push(`${media.area}/${media.storageKey}`);
    }
    const grouped = new Map<string, typeof files>();
    for (const file of files) grouped.set(file.checksum, [...(grouped.get(file.checksum) ?? []), file]);
    const duplicates = [...grouped.entries()].filter(([, values]) => values.length > 1).map(([checksum, values]) => ({ checksum, files: values.map(value => ({ area: value.area, storageKey: value.key, bytes: value.bytes })) }));
    const candidates = files.filter(file => !referencedKeys.has(file.key) && !(file.area === "products" && libraryKeys.has(file.key)));
    return NextResponse.json({
      readOnly: true,
      totalManagedFiles: files.length,
      referencedFiles: files.filter(file => referencedKeys.has(file.key)).length,
      unreferencedCandidates: candidates.length,
      protectedMediaLibraryAssets: libraryKeys.size,
      pendingCleanupJobs: jobs.length,
      recoverableBytes: candidates.reduce((sum, file) => sum + file.bytes, 0),
      missingFiles: missing,
      duplicates,
      queue: jobs,
      areas: Object.fromEntries(areas.map(area => [area, files.filter(file => file.area === area).length])),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Media storage audit failed", { error: error instanceof Error ? error.message : "unknown error" });
    return NextResponse.json({ error: "Unable to audit media storage" }, { status: 503 });
  }
}
