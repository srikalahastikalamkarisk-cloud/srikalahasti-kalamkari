import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

const MAX_SIZE = 5 * 1024 * 1024;

const formats = {
  jpeg: { ext: "jpg", mime: "image/jpeg" },
  png: { ext: "png", mime: "image/png" },
  webp: { ext: "webp", mime: "image/webp" },
} as const;

function detectFormat(bytes: Uint8Array) {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) return formats.jpeg;

  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) return formats.png;

  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) return formats.webp;

  return null;
}

export async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  if (req.headers.get("origin") !== req.nextUrl.origin) {
    return NextResponse.json(
      { error: "Invalid origin" },
      { status: 403 }
    );
  }

  const contentLength = Number(req.headers.get("content-length"));

  if (
    !Number.isFinite(contentLength) ||
    contentLength <= 0 ||
    contentLength > MAX_SIZE + 1024 * 1024
  ) {
    return NextResponse.json(
      { error: "Upload must be 5 MB or smaller" },
      { status: 413 }
    );
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Select an image file" },
      { status: 400 }
    );
  }

  if (file.size === 0 || file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "Image must be between 1 byte and 5 MB" },
      { status: 413 }
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const format = detectFormat(bytes);

  if (!format || file.type !== format.mime) {
    return NextResponse.json(
      { error: "Only valid JPG, PNG and WebP images are allowed" },
      { status: 400 }
    );
  }

  try {
    const directory = path.join(
      process.cwd(),
      "public",
      "uploads",
      "products"
    );

    await mkdir(directory, { recursive: true });

    const filename = `${randomUUID()}.${format.ext}`;

    await writeFile(
      path.join(directory, filename),
      bytes,
      { flag: "wx" }
    );

    return NextResponse.json(
      {
        success: true,
        image: `/uploads/products/${filename}`,
        filename,
        size: file.size,
        format: format.ext,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Product image upload failed", error);

    return NextResponse.json(
      { error: "Unable to upload product image" },
      { status: 500 }
    );
  }
}
