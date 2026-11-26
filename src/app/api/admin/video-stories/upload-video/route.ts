import { handleAdminVideoUpload } from "@/lib/admin/video-upload-handler";
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handleAdminVideoUpload(req, "stories");
}
