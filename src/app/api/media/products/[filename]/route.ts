import { NextRequest, NextResponse } from "next/server";
import { readFile, stat, realpath } from "node:fs/promises";
import path from "node:path";
import { confinedMediaPath } from "@/lib/admin/media-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, context: { params: Promise<{ filename: string }> }) {
  const { filename } = await context.params;
  try {
    const { target, directory } = await confinedMediaPath(filename);
    const actual = await realpath(target);
    const metadata = await stat(actual);
    if (!actual.startsWith(`${directory}${path.sep}`) || !metadata.isFile() || (metadata.mode & 0o022) !== 0) return new NextResponse(null, { status: 404 });
    const bytes = await readFile(actual);
    const contentType = filename.endsWith(".jpg") ? "image/jpeg" : filename.endsWith(".png") ? "image/png" : filename.endsWith(".ico") ? "image/x-icon" : "image/webp";
    return new NextResponse(bytes, { headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
  } catch { return new NextResponse(null, { status: 404 }); }
}
