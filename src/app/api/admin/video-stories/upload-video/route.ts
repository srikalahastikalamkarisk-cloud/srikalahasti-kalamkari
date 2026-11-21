import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { mkdir, realpath, stat, open, unlink } from "node:fs/promises";
import path from "node:path";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { validOrigin } from "@/lib/admin/origin";
import { mediaStorageRoot } from "@/lib/admin/media-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SIZE = 50 * 1024 * 1024;

function detectVideo(bytes: Uint8Array) {
  if (
    bytes.length >= 12 &&
    Buffer.from(bytes.slice(4, 8)).toString("ascii") === "ftyp"
  ) {
    const brand = Buffer.from(bytes.slice(8, 12)).toString("ascii");
    if (["isom", "iso2", "mp41", "mp42", "avc1", "M4V "].includes(brand)) {
      return { ext: "mp4", mime: "video/mp4" };
    }
  }

  if (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3 &&
    Buffer.from(bytes.subarray(0, Math.min(bytes.length, 4096)))
      .includes(Buffer.from("webm"))
  ) {
    return { ext: "webm", mime: "video/webm" };
  }

  return null;
}

export async function POST(req: NextRequest) {
  if (!await getCurrentAdmin()) {
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

  const contentLength = Number(req.headers.get("content-length"));

  if (
    !Number.isFinite(contentLength) ||
    contentLength < 1 ||
    contentLength > MAX_SIZE + 1024 * 1024
  ) {
    return NextResponse.json(
      { error: "Video upload must be 50 MB or smaller" },
      { status: 413 }
    );
  }

  let root: string;

  try {
    root = await mediaStorageRoot();
  } catch {
    return NextResponse.json(
      { error: "Persistent media storage is unavailable" },
      { status: 503 }
    );
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");

  if (
    !(file instanceof File) ||
    file.size < 1 ||
    file.size > MAX_SIZE
  ) {
    return NextResponse.json(
      { error: "Choose an MP4 or WebM video up to 50 MB" },
      { status: 400 }
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const detected = detectVideo(bytes);

  if (!detected || file.type !== detected.mime) {
    return NextResponse.json(
      { error: "Invalid MP4 or WebM video" },
      { status: 400 }
    );
  }

  try {
    const directory = path.join(root, "story-videos");

    await mkdir(directory, {
      recursive: true,
      mode: 0o750,
    });

    const resolved = await realpath(directory);

    if (!resolved.startsWith(`${root}${path.sep}`)) {
      throw new Error("Storage path escaped");
    }

    const info = await stat(resolved);

    if (
      !info.isDirectory() ||
      (info.mode & 0o022) !== 0
    ) {
      throw new Error("Unsafe video directory");
    }

    const filename = `${randomUUID()}.${detected.ext}`;
    const target = path.join(resolved, filename);

    // HERO_VIDEO_UPLOAD_SECURITY_V2
    const handle = await open(target, "wx", 0o640);

    let completed = false;

    try {
      await handle.writeFile(bytes);
      completed = true;
    } finally {
      await handle.close();

      if (!completed) {
        await unlink(target).catch(() => undefined);
      }
    }

    return NextResponse.json(
      {
        success: true,
        url: `/api/media/story-videos/${filename}`,
        filename,
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to store video" },
      { status: 500 }
    );
  }
}
