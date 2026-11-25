import { detectExtendedImage } from "./extended-image-format";
import { optimizeImage } from "./image-optimizer";
import { randomUUID } from "node:crypto";
import { isValidRequestOrigin } from "@/lib/request-origin";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import type { MediaStorageArea } from "./media-storage";

const MAX_SIZE = 5 * 1024 * 1024;
const formats = {
  jpeg: { ext: "jpg", mime: "image/jpeg" },
  png: { ext: "png", mime: "image/png" },
  webp: { ext: "webp", mime: "image/webp" },
} as const;

function detectFormat(bytes: Uint8Array) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return formats.jpeg;
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return formats.png;
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return formats.webp;
  return null;
}

export function createPersistentImageUploadHandler(options: {
  area: "products" | "categories";
  getCurrentAdmin: () => Promise<unknown>;
  getStorageRoot: () => Promise<string>;
  createId?: () => string;
}) {
  const createId = options.createId ?? randomUUID;
  return async function POST(req: NextRequest) {
    if (!await options.getCurrentAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!isValidRequestOrigin(req)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });

    const contentLength = Number(req.headers.get("content-length"));
    if (!Number.isFinite(contentLength) || contentLength <= 0 || contentLength > MAX_SIZE + 1024 * 1024) {
      return NextResponse.json({ error: "Upload must be 5 MB or smaller" }, { status: 413 });
    }
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Select an image file" }, { status: 400 });
    if (file.size === 0 || file.size > MAX_SIZE) return NextResponse.json({ error: "Image must be between 1 byte and 5 MB" }, { status: 413 });

    const bytes = new Uint8Array(await file.arrayBuffer());
    const format = detectFormat(bytes) ?? detectExtendedImage(bytes);
    if (!format || file.type !== format.mime) return NextResponse.json({ error: "Only valid JPG, PNG, WebP, TIFF and AVIF images are allowed" }, { status: 400 });

    try {
      const root = await options.getStorageRoot();
      const optimized = await optimizeImage(
        bytes,
        options.area === "products" ? "product" : "category"
      );

      const filename = `${createId()}.${optimized.extension}`;

      await writeFile(
        path.join(root, options.area, filename),
        optimized.bytes,
        { flag: "wx", mode: 0o640 }
      );

      return NextResponse.json({
        success: true,
        image: `/api/media/${options.area}/${filename}`,
        filename,
        size: optimized.optimizedSize,
        originalSize: optimized.originalSize,
        optimized: optimized.optimized,
        format: optimized.extension
      }, { status: 201 });
    } catch (error) {
      console.error(`${options.area} image upload failed`, error);
      return NextResponse.json({ error: "Unable to upload image" }, { status: 500 });
    }
  };
}

export type PersistentImageArea = Extract<MediaStorageArea, "products" | "categories">;
