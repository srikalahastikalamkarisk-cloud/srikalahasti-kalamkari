import { NextRequest, NextResponse } from "next/server";
import { open, realpath, lstat } from "node:fs/promises";
import path from "node:path";
import { mediaStorageRoot } from "@/lib/admin/media-storage";

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

    let start = 0;
    let end = size - 1;
    let status = 200;

    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);

      if (!match || (match[1] === "" && match[2] === "")) {
        await handle.close();
        return new NextResponse(null, {
          status: 416,
          headers: {
            ...headers,
            "Content-Range": `bytes */${size}`,
          },
        });
      }

      if (match[1] === "" && match[2] !== "") {
        const suffix = Number(match[2]);
        if (!Number.isSafeInteger(suffix) || suffix < 1) {
          await handle.close();
          return new NextResponse(null, {
            status: 416,
            headers: { ...headers, "Content-Range": `bytes */${size}` },
          });
        }
        start = Math.max(0, size - suffix);
      } else {
        start = Number(match[1]);
        end = match[2] ? Number(match[2]) : size - 1;
      }

      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start < 0 ||
        start >= size ||
        end < start
      ) {
        await handle.close();
        return new NextResponse(null, {
          status: 416,
          headers: { ...headers, "Content-Range": `bytes */${size}` },
        });
      }

      end = Math.min(end, size - 1);
      status = 206;
    }

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

    // Handle browser refresh, seek and cancelled video requests safely.
    const webStream = new ReadableStream<Uint8Array>({
      start(controller) {
        let finished = false;

        const close = () => {
          if (finished) return;
          finished = true;
          try {
            controller.close();
          } catch {
            // Browser may already have cancelled the response.
          }
        };

        const fail = (error: Error) => {
          if (finished) return;
          finished = true;
          try {
            controller.error(error);
          } catch {
            // Response was already cancelled.
          }
        };

        stream.on("data", (chunk: Buffer | string) => {
          if (finished) return;
          try {
            controller.enqueue(
              typeof chunk === "string"
                ? Buffer.from(chunk)
                : new Uint8Array(chunk)
            );
          } catch {
            finished = true;
            stream.destroy();
          }
        });

        stream.once("end", close);
        stream.once("error", fail);
        stream.once("close", close);
      },
      cancel() {
        stream.destroy();
      },
    });

    return new NextResponse(webStream, {
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
