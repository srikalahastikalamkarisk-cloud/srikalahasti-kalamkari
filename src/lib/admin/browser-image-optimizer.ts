"use client";

export type BrowserImagePurpose =
  | "product"
  | "category"
  | "hero"
  | "gallery"
  | "logo"
  | "general";

const profiles = {
  product: { width: 2000, height: 2500 },
  category: { width: 1200, height: 1500 },
  hero: { width: 2560, height: 1920 },
  gallery: { width: 1800, height: 2200 },
  logo: { width: 640, height: 640 },
  general: { width: 2000, height: 2500 },
} as const;

const MAX_UPLOAD = 5 * 1024 * 1024;
const MAX_BROWSER_INPUT = 100 * 1024 * 1024;

let processing = false;

function isServerImageFile(file: File): boolean {
  return ["image/tiff", "image/avif"].includes(file.type);
}

export function isSupportedImageFile(file: File): boolean {
  return isServerImageFile(file) || [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/bmp",
    "image/x-ms-bmp"
  ].includes(file.type) ||
    (!file.type && /\.bmp$/i.test(file.name));
}


export async function prepareImageUpload(
  file: File,
  purpose: BrowserImagePurpose = "general"
): Promise<File> {
  const isBmp =
    ["image/bmp", "image/x-ms-bmp"].includes(file.type) ||
    (!file.type && /\.bmp$/i.test(file.name));

  if (!isSupportedImageFile(file)) {
    throw new Error("Choose a valid JPG, PNG, WebP, BMP, TIFF or AVIF image.");
  }

  if (!file.size) {
    throw new Error("The selected image is empty.");
  }

  if (isServerImageFile(file)) {
    if (file.size > MAX_UPLOAD) {
      throw new Error(
        "TIFF and AVIF images must currently be 5 MB or smaller."
      );
    }
    return file;
  }

  // Avoid unnecessary browser-side recompression.
  // The server optimizer handles these files.
  if (!isBmp && file.size <= MAX_UPLOAD) {
    return file;
  }

  if (file.size > MAX_BROWSER_INPUT) {
    throw new Error(
      "This image is too large for safe browser processing."
    );
  }

  if (processing) {
    throw new Error(
      "Another image is being optimized. Please wait."
    );
  }

  processing = true;

  let bitmap: ImageBitmap | undefined;
  let canvas: HTMLCanvasElement | undefined;

  try {
    if (isBmp) {
      const header = new DataView(
        await file.slice(0, 54).arrayBuffer()
      );

      if (
        header.byteLength < 54 ||
        header.getUint16(0, true) !== 0x4d42 ||
        header.getUint32(14, true) < 40
      ) {
        throw new Error("Invalid or unsupported BMP image.");
      }

      const width = header.getInt32(18, true);
      const height = Math.abs(header.getInt32(22, true));

      if (
        width < 1 ||
        height < 1 ||
        width * height > 25_000_000
      ) {
        throw new Error("BMP resolution exceeds the safe limit.");
      }
    }

    bitmap = await createImageBitmap(file);

    if (bitmap.width * bitmap.height > 25_000_000) {
      throw new Error(
        "Image resolution exceeds the safe processing limit."
      );
    }

    const profile = profiles[purpose];

    const scale = Math.min(
      1,
      profile.width / bitmap.width,
      profile.height / bitmap.height
    );

    canvas = document.createElement("canvas");

    canvas.width = Math.max(
      1,
      Math.round(bitmap.width * scale)
    );

    canvas.height = Math.max(
      1,
      Math.round(bitmap.height * scale)
    );

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Image optimization is unavailable.");
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";

    context.drawImage(
      bitmap,
      0,
      0,
      canvas.width,
      canvas.height
    );

    const target = canvas;

    if (purpose === "logo") {
      const png = await new Promise<Blob | null>(
        resolve => target.toBlob(resolve, "image/png")
      );

      if (!png || png.type !== "image/png" || png.size > MAX_UPLOAD) {
        throw new Error("Logo cannot be optimized safely.");
      }

      return new File(
        [png],
        file.name.replace(/\.[^.]+$/, "") + ".png",
        { type: "image/png", lastModified: file.lastModified }
      );
    }

    for (const quality of [0.96, 0.94, 0.92, 0.90]) {
      const blob = await new Promise<Blob | null>(
        resolve => target.toBlob(
          resolve,
          "image/webp",
          quality
        )
      );

      if (
        blob &&
        blob.type === "image/webp" &&
        blob.size > 0 &&
        blob.size <= MAX_UPLOAD
      ) {
        return new File(
          [blob],
          file.name.replace(/\.[^.]+$/, "") + ".webp",
          {
            type: "image/webp",
            lastModified: file.lastModified,
          }
        );
      }
    }

    throw new Error(
      "Unable to optimize this image without excessive quality loss."
    );
  } finally {
    bitmap?.close();

    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }

    processing = false;
  }
}
