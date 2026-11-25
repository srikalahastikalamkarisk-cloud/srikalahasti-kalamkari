import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { processMediaCleanupBatch } from "@/lib/admin/media-cleanup-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: NextRequest) {
  const secret = process.env.MEDIA_CLEANUP_CRON_SECRET?.trim() ?? "";
  const header = request.headers.get("authorization") ?? "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (secret.length < 32 || supplied.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(secret));
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await processMediaCleanupBatch(prisma);
    return NextResponse.json({ success: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Scheduled media cleanup failed", { error: error instanceof Error ? error.message : "unknown error" });
    return NextResponse.json({ error: "Media cleanup could not run" }, { status: 503 });
  }
}
