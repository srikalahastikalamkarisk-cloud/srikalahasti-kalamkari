import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { mediaStorageRoot } from "@/lib/admin/media-storage";

export const runtime = "nodejs";
export async function GET() {
  if (!await getCurrentAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { const root = await mediaStorageRoot(); return NextResponse.json({ ready: true, storage: root }); }
  catch (error) { return NextResponse.json({ ready: false, error: error instanceof Error ? error.message : "Persistent media storage is unavailable" }, { status: 503 }); }
}
