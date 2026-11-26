import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { chmod, link, mkdir, mkdtemp, realpath, rm, stat, open } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { validOrigin } from "@/lib/admin/origin";
import { mediaStorageRoot } from "@/lib/admin/media-storage";
import { acquireVideoProcessingLock } from "@/lib/admin/video-processing-lock";
import { VideoProcessingError, logVideoUploadFailure } from "@/lib/admin/video-processing-errors";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const MAX_SIZE = 50 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = new Set([".mp4"]);

async function validateMp4(filePath: string, size: number) {
  const handle = await open(filePath, "r");
  try {
    let offset = 0;
    let boxes = 0;
    let ftyp = false;
    let moov = false;
    let mdat = false;
    const header = Buffer.alloc(16);

    while (offset < size) {
      if (++boxes > 10000 || size - offset < 8) {
        throw new Error("Invalid MP4 structure");
      }

      const read = await handle.read(header, 0, 8, offset);
      if (read.bytesRead !== 8) {
        throw new Error("Invalid MP4 header");
      }

      let length = header.readUInt32BE(0);
      const type = header.toString("ascii", 4, 8);
      let headerSize = 8;

      if (length === 1) {
        const extended = await handle.read(header, 8, 8, offset + 8);
        if (extended.bytesRead !== 8) {
          throw new Error("Invalid extended box");
        }
        const value = header.readBigUInt64BE(8);
        if (value > BigInt(size)) {
          throw new Error("Invalid box length");
        }
        length = Number(value);
        headerSize = 16;
      } else if (length === 0) {
        length = size - offset;
      }

      if (length < headerSize || offset + length > size) {
        throw new Error("Invalid MP4 box size");
      }

      if (type === "ftyp" && offset === 0 && length >= 16) ftyp = true;
      if (type === "moov" && length > headerSize) moov = true;
      if (type === "mdat" && length > headerSize) mdat = true;

      offset += length;
    }

    if (!ftyp || !moov || !mdat) {
      throw new Error("Incomplete MP4");
    }
  } finally {
    await handle.close();
  }
}

type Endpoint = "hero" | "stories";

function json(body: Record<string, unknown>, status: number, requestId: string, headers?: HeadersInit) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("x-request-id", requestId);
  return NextResponse.json(body, { status, headers: responseHeaders });
}

function failureResponse(error: unknown, requestId: string) {
  if (error instanceof VideoProcessingError) {
    if (error.category === "busy") {
      return json({ error: "Another video is being uploaded. Please retry shortly.", requestId }, 429, requestId, { "Retry-After": "30" });
    }
    if (["invalid_input", "unsupported_format", "invalid_media", "duration_limit", "resolution_limit", "output_invalid"].includes(error.category)) {
      return json({ error: "Please upload a valid MP4 video exported for web playback.", requestId }, 422, requestId);
    }
    if (error.category === "client_cancelled") {
      return json({ error: "Video processing was cancelled. You can retry the upload.", requestId }, 408, requestId);
    }
  }
  return json({ error: "Video upload is temporarily unavailable. Please retry shortly.", requestId }, 503, requestId);
}

export async function handleAdminVideoUpload(req: NextRequest, endpoint: Endpoint) {
  const requestId = randomUUID();
  const startedAt = Date.now();
  let inputBytes: number | undefined;

  try {
    if (!await getCurrentAdmin()) return json({ error: "Unauthorized" }, 401, requestId);
  } catch (error) {
    logVideoUploadFailure({ requestId, endpoint, error, elapsedMs: Date.now() - startedAt });
    return json({ error: "Unable to verify the administrator session" }, 503, requestId);
  }
  if (!validOrigin(req)) return json({ error: "Invalid origin" }, 403, requestId);

  const contentLength = Number(req.headers.get("content-length"));
  if (!Number.isFinite(contentLength) || contentLength < 1 || contentLength > MAX_SIZE + 1024 * 1024) {
    return json({ error: "Video upload must be 50 MB or smaller" }, 413, requestId);
  }

  let root: string;
  try {
    root = await mediaStorageRoot();
  } catch {
    console.error("admin_video_upload_storage_unavailable", JSON.stringify({ requestId, endpoint }));
    return json({ error: "Persistent media storage is unavailable" }, 503, requestId);
  }

  let releaseLock: (() => Promise<void>) | undefined;
  let temporary: string | undefined;
  try {
    // Acquire before parsing multipart data. Proxy buffering is capped at 64 MB;
    // this lock also prevents more than one 50 MB body from being processed at once.
    releaseLock = await acquireVideoProcessingLock(root);
    if (req.signal.aborted) throw new VideoProcessingError("client_cancelled", "upload", "Client disconnected");

    let form: FormData;
    try { form = await req.formData(); }
    catch (error) { throw new VideoProcessingError("invalid_input", "upload", "Multipart upload was invalid", error); }

    const file = form.get("file");
    if (!(file instanceof File) || file.size < 1 || file.size > MAX_SIZE) {
      throw new VideoProcessingError("invalid_input", "upload", "Upload is empty or exceeds 50 MB");
    }
    inputBytes = file.size;
    const extension = path.extname(file.name).toLowerCase();
    if (!ACCEPTED_EXTENSIONS.has(extension)) {
      throw new VideoProcessingError("unsupported_format", "upload", "Unsupported video extension");
    }

    const area = endpoint === "stories" ? "story-videos" : "hero-videos";
    const directory = path.join(root, area);
    await mkdir(directory, { recursive: true, mode: 0o750 });
    const resolved = await realpath(directory);
    if (!resolved.startsWith(`${root}${path.sep}`)) {
      throw new VideoProcessingError("storage_permission", "store", "Video storage path is unsafe");
    }
    const directoryInfo = await stat(resolved);
    if (!directoryInfo.isDirectory() || (directoryInfo.mode & 0o022) !== 0) {
      throw new VideoProcessingError("storage_permission", "store", "Video storage permissions are unsafe");
    }

    temporary = await mkdtemp(path.join(root, ".video-processing-"));
    const input = path.join(temporary, `input${extension}`);
    await pipeline(
      Readable.fromWeb(file.stream() as import("node:stream/web").ReadableStream),
      createWriteStream(input, { flags: "wx", mode: 0o600 }),
      { signal: req.signal },
    ).catch(error => {
      throw new VideoProcessingError(req.signal.aborted ? "client_cancelled" : "invalid_input", "upload", "Video upload stream failed", error);
    });

    const inputInfo = await stat(input);

    if (inputInfo.size !== file.size || inputInfo.size > MAX_SIZE) {
      throw new VideoProcessingError(
        "invalid_input", "upload", "Uploaded bytes do not match metadata"
      );
    }

    try {
      await validateMp4(input, inputInfo.size);
    } catch (error) {
      throw new VideoProcessingError(
        "invalid_media", "upload", "Invalid MP4 container", error
      );
    }

    if (req.signal.aborted) {
      throw new VideoProcessingError(
        "client_cancelled", "upload", "Client disconnected"
      );
    }

    const filename = `${randomUUID()}.mp4`;
    const target = path.join(resolved, filename);
    try {
      await chmod(input, 0o640);
      await link(input, target);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const category = code === "EXDEV" ? "storage_link"
        : code === "ENOSPC" ? "storage_space"
          : code === "EACCES" || code === "EPERM" ? "storage_permission" : "internal";
      throw new VideoProcessingError(category, "store", "Uploaded video could not be stored", error);
    }

    return json({
      success: true,
      requestId,
      url: `/api/media/${endpoint === "stories" ? "story-videos" : "hero-videos"}/${filename}`,
      filename,
      originalSize: inputInfo.size,
      optimizedSize: inputInfo.size,
    }, 201, requestId);
  } catch (error) {
    logVideoUploadFailure({ requestId, endpoint, error, inputBytes, elapsedMs: Date.now() - startedAt });
    return failureResponse(error, requestId);
  } finally {
    if (temporary) await rm(temporary, { recursive: true, force: true }).catch(() => undefined);
    await releaseLock?.().catch(() => undefined);
  }
}
