import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { validOrigin } from "@/lib/admin/origin";
import { processMediaCleanupBatch } from "@/lib/admin/media-cleanup-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!await getCurrentAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!validOrigin(req)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  try {
    const result = await processMediaCleanupBatch(prisma);
    const remaining = await prisma.mediaCleanupJob.count({ where: { status: { in: ["PENDING", "PROCESSING", "FAILED", "PROTECTED", "DEAD"] } } });
    return NextResponse.json({ success: true, ...result, remaining }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Media cleanup processing failed", { error: error instanceof Error ? error.message : "unknown error" });
    return NextResponse.json({ error: "Unable to process media cleanup queue" }, { status: 503 });
  }
}
