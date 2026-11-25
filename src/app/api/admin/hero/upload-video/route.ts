import { optimizeVideoFile } from "@/lib/admin/video-optimizer";
import { mkdtemp, rm, chmod, link } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { mkdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { validOrigin } from "@/lib/admin/origin";
import { mediaStorageRoot } from "@/lib/admin/media-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SIZE = 50 * 1024 * 1024;

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
      { error: "Choose a supported video up to 50 MB" },
      { status: 400 }
    );
  }


  const extension = path.extname(file.name).toLowerCase();

  if (![
    ".mp4", ".mov", ".avi", ".mkv", ".webm",
    ".m4v", ".mpeg", ".mpg", ".3gp", ".wmv"
  ].includes(extension)) {
    return NextResponse.json(
      { error: "Unsupported video format. Audio-only files are not videos." },
      { status: 400 }
    );
  }

  try {
    const directory = path.join(root, "hero-videos");

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


    const temporary = await mkdtemp(
      path.join(root, ".video-processing-")
    );

    const filename = `${randomUUID()}.mp4`;
    const target = path.join(resolved, filename);
    let optimization;

    try {
      const input = path.join(temporary, "input" + extension);
      const output = path.join(temporary, "optimized.mp4");

      await pipeline(
        Readable.fromWeb(
          file.stream() as import("node:stream/web").ReadableStream
        ),
        createWriteStream(input, {
          flags: "wx",
          mode: 0o600
        })
      );

      optimization = await optimizeVideoFile(
        input,
        output,
        form?.get("target") === "mobileVideo" ? "hero-mobile" : "hero-desktop"
      );

      if (optimization.optimizedSize > MAX_SIZE) {
        throw new Error("Optimized video exceeds storage limit");
      }

      await chmod(output, 0o640);
      await link(output, target);

    } finally {
      await rm(temporary, {
        recursive: true,
        force: true
      }).catch(() => undefined);
    }

    return NextResponse.json(
      {
        success: true,
        url: `/api/media/hero-videos/${filename}`,
        filename,
        originalSize: optimization.originalSize,
        optimizedSize: optimization.optimizedSize,
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { error: "Video optimization failed. Check format, duration or retry shortly." },
      { status: 500 }
    );
  }
}
