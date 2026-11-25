import sharp from "sharp";

export type ImagePurpose =
  | "product"
  | "category"
  | "hero"
  | "gallery"
  | "thumbnail"
  | "logo"
  | "general";

const profiles = {
  product: { width: 2000, height: 2500, quality: 90 },
  category: { width: 1200, height: 1500, quality: 88 },
  hero: { width: 2560, height: 1920, quality: 88 },
  gallery: { width: 1800, height: 2200, quality: 88 },
  thumbnail: { width: 400, height: 500, quality: 84 },
  logo: { width: 640, height: 640, quality: 95 },
  general: { width: 2000, height: 2500, quality: 90 },
} as const;

export const MAX_OPTIMIZER_INPUT_BYTES =
  20 * 1024 * 1024;

let active = false;

export async function optimizeImage(
  input: Uint8Array,
  purpose: ImagePurpose = "general",
) {
  if (
    input.byteLength === 0 ||
    input.byteLength > MAX_OPTIMIZER_INPUT_BYTES
  ) {
    throw new Error("Image exceeds safe processing size");
  }

  if (active) {
    throw new Error(
      "Image optimizer is busy. Please retry shortly."
    );
  }

  active = true;

  try {
    const profile = profiles[purpose];

    const image = sharp(input, {
      limitInputPixels: 25_000_000,
      failOn: "error",
      sequentialRead: true,
    });

    const metadata = await image.metadata();

    if (
      !metadata.format ||
      !["jpeg", "png", "webp", "tiff", "heif"].includes(metadata.format)
    ) {
      throw new Error("Unsupported image format");
    }

    if ((metadata.pages ?? 1) > 1) {
      throw new Error("Animated images are not supported");
    }

    if (
      !metadata.width ||
      !metadata.height ||
      metadata.width * metadata.height > 25_000_000
    ) {
      throw new Error("Invalid image dimensions");
    }

    const rotated = [5, 6, 7, 8].includes(
      metadata.orientation ?? 1
    );

    const width = rotated
      ? metadata.height
      : metadata.width;

    const height = rotated
      ? metadata.width
      : metadata.height;

    const withinDimensions =
      width <= profile.width &&
      height <= profile.height;

    const canKeepOriginal =
      ["jpeg", "png", "webp"].includes(metadata.format);

    const originalExtension =
      metadata.format === "jpeg"
        ? "jpg"
        : metadata.format === "png"
          ? "png"
          : "webp";

    const originalMime =
      metadata.format === "jpeg"
        ? "image/jpeg"
        : `image/${metadata.format}`;

    const result = await image
      .rotate()
      .resize({
        width: profile.width,
        height: profile.height,
        fit: "inside",
        withoutEnlargement: true,
      })
      .toColourspace("srgb")
      .webp({
        quality: profile.quality,
        alphaQuality: 100,
        effort: 3,
        smartSubsample: true,
        lossless: purpose === "logo",
      })
      .timeout({ seconds: 30 })
      .toBuffer({ resolveWithObject: true });

    if (
      canKeepOriginal &&
      withinDimensions &&
      input.byteLength <= 5 * 1024 * 1024 &&
      result.data.length >= input.byteLength
    ) {
      return {
        bytes: input,
        extension: originalExtension,
        mime: originalMime,
        originalSize: input.byteLength,
        optimizedSize: input.byteLength,
        optimized: false,
        width,
        height,
      };
    }

    if (result.data.length > 5 * 1024 * 1024) {
      throw new Error(
        "Optimized image exceeds the safe storage limit."
      );
    }

    return {
      bytes: result.data,
      extension: "webp" as const,
      mime: "image/webp",
      originalSize: input.byteLength,
      optimizedSize: result.data.length,
      optimized: true,
      width: result.info.width,
      height: result.info.height,
    };
  } finally {
    active = false;
  }
}
