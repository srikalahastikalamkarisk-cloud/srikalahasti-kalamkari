import { NextRequest, NextResponse } from "next/server";
import { unlink } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { validOrigin } from "@/lib/admin/origin";
import { confinedMediaPath, mediaStorageRoot } from "@/lib/admin/media-storage";

export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  if (!await getCurrentAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!validOrigin(req)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  try { await mediaStorageRoot(); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Persistent storage is unavailable" }, { status: 503 }); }
  const jobs = await prisma.mediaDeletionJob.findMany({ where: { status: "FAILED" }, take: 20, orderBy: { createdAt: "asc" } });
  let removed = 0;
  for (const job of jobs) {
    try {
      const { target } = await confinedMediaPath(job.storageKey);
      await unlink(target).catch(error => {
        if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
      });
      await prisma.mediaAsset.delete({ where: { id: job.mediaId } });
      removed++;
    } catch (error) {
      await prisma.mediaDeletionJob.update({ where: { id: job.id }, data: { attempts: { increment: 1 }, lastError: error instanceof Error ? error.message : "Retry failed" } });
    }
  }
  return NextResponse.json({ success: true, removed, remaining: jobs.length - removed });
}
