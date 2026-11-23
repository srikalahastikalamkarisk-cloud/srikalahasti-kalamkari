import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { mediaStorageRoot } from "@/lib/admin/media-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "X-Robots-Tag": "noindex, nofollow",
};

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await mediaStorageRoot();
    return NextResponse.json({ status: "ok" }, { headers });
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503, headers });
  }
}
