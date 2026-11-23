import { NextRequest, NextResponse } from "next/server";
import { open, realpath, lstat } from "node:fs/promises";
import path from "node:path";
import { mediaStorageRoot } from "@/lib/admin/media-storage";
import { parseVideoByteRange, readableToCancellableWebStream } from "@/lib/media/video-stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ filename: string }>;
};

export async function GET(req: NextRequest, context: Context) {
  const { filename } = await context.params;

  if (
    !/^[a-f0-9-]{36}\.(mp4|webm)$/.test(filename)
  ) {
    return NextResponse.json(
      { error: "Invalid video filename" },
      { status: 400 }
    );
  }

  let handle: Awaited<ReturnType<typeof open>> | undefined;

  try {
    const root = await mediaStorageRoot();
    const directory = await realpath(path.join(root, "story-videos"));
    const target = path.resolve(directory, filename);

    if (!target.startsWith(`${directory}${path.sep}`)) {
      return NextResponse.json(
        { error: "Invalid video path" },
        { status: 400 }
      );
    }

    // HERO_VIDEO_PLAYBACK_SECURITY_V2
    const entry = await lstat(target);

    if (!entry.isFile() || entry.isSymbolicLink()) {
      return NextResponse.json(
        { error: "Video not found" },
        { status: 404 }
      );
    }

    handle = await open(target, "r");
    const info = await handle.stat();

    if (!info.isFile()) {
      await handle.close();
      return NextResponse.json(
        { error: "Video not found" },
        { status: 404 }
      );
    }

    const size = info.size;

    if (size === 0) {
      await handle.close();
      handle = undefined;

      return NextResponse.json(
        { error: "Empty video file" },
        { status: 404 }
      );
    }
    const mime = filename.endsWith(".mp4") ? "video/mp4" : "video/webm";
    const range = req.headers.get("range");

    const headers = {
      "Content-Type": mime,
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    };

    const byteRange = parseVideoByteRange(range, size);
    if (!byteRange) {
      await handle.close();
      handle = undefined;
      return new NextResponse(null, {
        status: 416,
        headers: { ...headers, "Content-Range": `bytes */${size}` },
      });
    }
    const { start, end, status } = byteRange;

    const length = end - start + 1;
    const stream = handle.createReadStream({
      start,
      end,
      autoClose: true,
    });

    handle = undefined;

    const responseHeaders: Record<string, string> = {
      ...headers,
      "Content-Length": String(length),
    };

    if (status === 206) {
      responseHeaders["Content-Range"] = `bytes ${start}-${end}/${size}`;
    }

    return new NextResponse(readableToCancellableWebStream(stream), {
      status,
      headers: responseHeaders,
    });
  } catch {
    if (handle) await handle.close().catch(() => undefined);

    return NextResponse.json(
      { error: "Video unavailable" },
      { status: 404 }
    );
  }
}
