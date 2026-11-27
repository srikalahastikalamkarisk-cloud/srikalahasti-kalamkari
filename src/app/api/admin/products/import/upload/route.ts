import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { validOrigin } from "@/lib/admin/origin";
import {
  CHUNK_BYTES,
  UploadError,
  startUpload,
  saveUploadChunk,
  cancelUpload,
  uploadStatus,
  recoverUpload,
  finalizeUpload
} from "@/lib/admin/import-upload-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function boundedBody(
  req: NextRequest,
  limit: number
) {
  const length = Number(req.headers.get("content-length"));

  if (
    !Number.isSafeInteger(length) ||
    length < 1 ||
    length > limit ||
    !req.body
  ) {
    throw new UploadError("Invalid request size", 413);
  }

  const reader = req.body.getReader();
  const parts: Buffer[] = [];
  let received = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      received += value.byteLength;

      if (received > limit || received > length) {
        await reader.cancel();
        throw new UploadError("Request too large", 413);
      }

      parts.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }

  if (received !== length) {
    throw new UploadError("Incomplete request");
  }

  return Buffer.concat(parts, received);
}

export async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  if (!validOrigin(req)) {
    return NextResponse.json(
      { error: "Invalid origin" },
      { status: 403 }
    );
  }

  try {
    const action = req.nextUrl.searchParams.get("action");

    if (action === "start") {
      const bytes = await boundedBody(req, 4096);

      let input;

      try {
        input = JSON.parse(bytes.toString("utf8"));
      } catch {
        throw new UploadError("Invalid upload request");
      }

      if (
        !input ||
        !["csv", "zip"].includes(input.kind)
      ) {
        throw new UploadError("Invalid upload type");
      }

      return NextResponse.json(
        await startUpload(
          admin.id,
          input.kind,
          input.size
        ),
        { status: 201 }
      );
    }

    if (action === "recover") {
      return NextResponse.json(
        await recoverUpload(admin.id)
      );
    }

    const id = req.nextUrl.searchParams.get("id") ?? "";

    if (!/^[a-f0-9-]{36}$/.test(id)) {
      throw new UploadError("Invalid upload ID");
    }

    if (action === "chunk") {
      const rawIndex = req.nextUrl.searchParams.get("index");

      if (rawIndex === null || !/^\d+$/.test(rawIndex)) {
        throw new UploadError("Invalid chunk index");
      }

      const bytes = await boundedBody(req, CHUNK_BYTES);

      return NextResponse.json(
        await saveUploadChunk(
          admin.id,
          id,
          Number(rawIndex),
          bytes
        )
      );
    }

    if (action === "status") {
      return NextResponse.json(
        await uploadStatus(admin.id, id)
      );
    }

    if (action === "finalize") {
      return NextResponse.json(
        await finalizeUpload(admin.id, id)
      );
    }

    if (action === "cancel") {
      return NextResponse.json(
        await cancelUpload(admin.id, id)
      );
    }

    throw new UploadError("Invalid upload action");

  } catch (error) {
    if (error instanceof UploadError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    console.error("Import upload failed", error);

    return NextResponse.json(
      { error: "Unable to process upload" },
      { status: 500 }
    );
  }
}
