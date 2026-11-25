export function detectExtendedImage(bytes: Uint8Array) {
  if (bytes.length >= 8) {
    const tiffLE =
      bytes[0] === 0x49 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x2a &&
      bytes[3] === 0x00;

    const tiffBE =
      bytes[0] === 0x4d &&
      bytes[1] === 0x4d &&
      bytes[2] === 0x00 &&
      bytes[3] === 0x2a;

    if (tiffLE || tiffBE) {
      return { ext: "tiff", mime: "image/tiff" } as const;
    }
  }

  if (bytes.length >= 16) {
    const box = String.fromCharCode(...bytes.slice(4, 8));
    const brand = String.fromCharCode(...bytes.slice(8, 12));

    if (box === "ftyp" && brand === "avif") {
      return { ext: "avif", mime: "image/avif" } as const;
    }
  }

  return null;
}
