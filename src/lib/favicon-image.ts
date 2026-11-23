export const MAX_FAVICON_BYTES = 1024 * 1024;
const MIN_EDGE = 16;
const MAX_EDGE = 512;

export type FaviconImage = {
  extension: "png" | "jpg" | "webp" | "ico";
  mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/x-icon";
  width: number;
  height: number;
};

type Dimensions = { width: number; height: number };

function u16be(bytes: Uint8Array, offset: number) {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function u24le(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function u32le(bytes: Uint8Array, offset: number) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function pngDimensions(bytes: Uint8Array): Dimensions | null {
  if (bytes.length < 24 || bytes[0] !== 137 || bytes[1] !== 80 || bytes[2] !== 78 || bytes[3] !== 71 ||
    bytes[4] !== 13 || bytes[5] !== 10 || bytes[6] !== 26 || bytes[7] !== 10 ||
    bytes[8] !== 0 || bytes[9] !== 0 || bytes[10] !== 0 || bytes[11] !== 13 ||
    String.fromCharCode(...bytes.subarray(12, 16)) !== "IHDR") return null;
  const width = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(16, false);
  const height = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(20, false);
  return { width, height };
}

function jpegDimensions(bytes: Uint8Array): Dimensions | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return null;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) return null;
    if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) return null;
    const segmentLength = u16be(bytes, offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return null;
    if (startOfFrame.has(marker)) {
      if (segmentLength < 7) return null;
      return { height: u16be(bytes, offset + 3), width: u16be(bytes, offset + 5) };
    }
    offset += segmentLength;
  }
  return null;
}

function webpDimensions(bytes: Uint8Array): Dimensions | null {
  if (bytes.length < 30 || String.fromCharCode(...bytes.subarray(0, 4)) !== "RIFF" ||
    String.fromCharCode(...bytes.subarray(8, 12)) !== "WEBP" || u32le(bytes, 4) + 8 > bytes.length) return null;
  const chunk = String.fromCharCode(...bytes.subarray(12, 16));
  const chunkLength = u32le(bytes, 16);
  if (20 + chunkLength > bytes.length) return null;
  if (chunk === "VP8X" && chunkLength >= 10) {
    return { width: u24le(bytes, 24) + 1, height: u24le(bytes, 27) + 1 };
  }
  if (chunk === "VP8 " && chunkLength >= 10 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return { width: (bytes[26] | (bytes[27] << 8)) & 0x3fff, height: (bytes[28] | (bytes[29] << 8)) & 0x3fff };
  }
  if (chunk === "VP8L" && chunkLength >= 5 && bytes[20] === 0x2f) {
    return {
      width: 1 + (bytes[21] | ((bytes[22] & 0x3f) << 8)),
      height: 1 + ((bytes[22] >> 6) | (bytes[23] << 2) | ((bytes[24] & 0x0f) << 10)),
    };
  }
  return null;
}

function icoDimensions(bytes: Uint8Array): Dimensions | null {
  if (bytes.length < 22 || bytes[0] !== 0 || bytes[1] !== 0 || bytes[2] !== 1 || bytes[3] !== 0) return null;
  const count = bytes[4] | (bytes[5] << 8);
  if (count < 1 || count > 16 || 6 + count * 16 > bytes.length) return null;
  let largest = 0;
  for (let index = 0; index < count; index += 1) {
    const entry = 6 + index * 16;
    const width = bytes[entry] || 256;
    const height = bytes[entry + 1] || 256;
    const size = u32le(bytes, entry + 8);
    const imageOffset = u32le(bytes, entry + 12);
    if (width !== height || width < MIN_EDGE || width > MAX_EDGE || size < 16 || imageOffset < 6 + count * 16 || imageOffset + size > bytes.length) return null;
    const frame = bytes.subarray(imageOffset, imageOffset + size);
    const frameDimensions = pngDimensions(frame);
    if (frameDimensions) {
      if (frameDimensions.width !== width || frameDimensions.height !== height) return null;
    } else {
      if (frame.length < 40) return null;
      const headerSize = u32le(frame, 0);
      const dib = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
      const dibWidth = dib.getInt32(4, true);
      const doubledHeight = dib.getInt32(8, true);
      if (headerSize < 40 || headerSize > size || dibWidth !== width || Math.abs(doubledHeight) < height * 2 || Math.abs(doubledHeight) % 2 !== 0 || Math.abs(doubledHeight) / 2 !== height) return null;
    }
    largest = Math.max(largest, width);
  }
  return { width: largest, height: largest };
}

export function inspectFaviconImage(bytes: Uint8Array, declaredMime: string, filename: string): FaviconImage | null {
  if (bytes.length < 1 || bytes.length > MAX_FAVICON_BYTES) return null;
  let image: FaviconImage | null = null;
  const png = pngDimensions(bytes);
  if (png) image = { ...png, extension: "png", mimeType: "image/png" };
  else {
    const jpeg = jpegDimensions(bytes);
    if (jpeg) image = { ...jpeg, extension: "jpg", mimeType: "image/jpeg" };
    else {
      const webp = webpDimensions(bytes);
      if (webp) image = { ...webp, extension: "webp", mimeType: "image/webp" };
      else {
        const ico = icoDimensions(bytes);
        if (ico) image = { ...ico, extension: "ico", mimeType: "image/x-icon" };
      }
    }
  }
  if (!image || image.width < MIN_EDGE || image.height < MIN_EDGE || image.width > MAX_EDGE || image.height > MAX_EDGE || image.width !== image.height) return null;
  const mimeMatches = image.extension === "ico"
    ? ["image/x-icon", "image/vnd.microsoft.icon", "application/octet-stream", ""].includes(declaredMime.toLowerCase()) && filename.toLowerCase().endsWith(".ico")
    : declaredMime.toLowerCase() === image.mimeType;
  return mimeMatches ? image : null;
}
