import { inflateRawSync } from "node:zlib";
import { validatePhotoNumbers } from "./secure-image-import";

export const MAX_ZIP_BYTES = 20 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 30 * 1024 * 1024;
const MAX_ENTRIES = 2000;
const SUPPORTED = new Set(["jpg", "jpeg", "png", "webp"]);

export type PhotoEntry = { number: string; filename: string; mime: string; bytes: Buffer };

export function extractPhotoZip(archive: Uint8Array, requestedNumbers: string[]): Map<string, PhotoEntry> {
  if (archive.byteLength > MAX_ZIP_BYTES) throw new Error("ZIP must be 20 MB or smaller");
  const data = Buffer.from(archive.buffer, archive.byteOffset, archive.byteLength);
  const min = Math.max(0, data.length - 65557);
  let eocd = -1;
  for (let i = data.length - 22; i >= min; i--) if (data.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("Invalid ZIP: end record is missing");
  if (data.readUInt16LE(eocd + 4) || data.readUInt16LE(eocd + 6)) throw new Error("Multi-disk ZIP files are not supported");
  const count = data.readUInt16LE(eocd + 10);
  const centralSize = data.readUInt32LE(eocd + 12);
  let cursor = data.readUInt32LE(eocd + 16);
  if (count > MAX_ENTRIES || cursor + centralSize > eocd) throw new Error("ZIP directory is invalid or exceeds entry limits");
  const wanted = new Set(requestedNumbers);
  const found = new Map<string, PhotoEntry>();
  const seenPhotoNumbers = new Set<string>();
  let expanded = 0;
  let declaredExpanded = 0;
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > data.length || data.readUInt32LE(cursor) !== 0x02014b50) throw new Error("Invalid ZIP directory entry");
    const madeBy = data.readUInt16LE(cursor + 4);
    const flags = data.readUInt16LE(cursor + 8);
    const method = data.readUInt16LE(cursor + 10);
    const crc = data.readUInt32LE(cursor + 16);
    const compressedSize = data.readUInt32LE(cursor + 20);
    const uncompressedSize = data.readUInt32LE(cursor + 24);
    const nameLength = data.readUInt16LE(cursor + 28);
    const extraLength = data.readUInt16LE(cursor + 30);
    const commentLength = data.readUInt16LE(cursor + 32);
    const externalAttrs = data.readUInt32LE(cursor + 38);
    const localOffset = data.readUInt32LE(cursor + 42);
    if (cursor + 46 + nameLength + extraLength + commentLength > data.length) throw new Error("Truncated ZIP directory entry");
    const filename = data.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    cursor += 46 + nameLength + extraLength + commentLength;
    if (!filename || filename.includes("\\") || filename.startsWith("/") || /^[a-zA-Z]:/.test(filename) || filename.split("/").some(part => part === ".." || part === ".")) throw new Error(`Unsafe ZIP path: ${filename}`);
    if (filename.endsWith("/")) continue;
    declaredExpanded += uncompressedSize;
    if (declaredExpanded > MAX_EXPANDED_BYTES) throw new Error("ZIP expands beyond the 30 MB safety limit");
    const unixMode = (madeBy >> 8) === 3 ? externalAttrs >>> 16 : 0;
    if ((unixMode & 0xf000) === 0xa000) throw new Error(`ZIP symlink rejected: ${filename}`);
    if (flags & 1) throw new Error("Encrypted ZIP entries are not supported");
    const ext = filename.split("/").pop()!.split(".").pop()!.toLowerCase();
    if (!SUPPORTED.has(ext)) throw new Error(`Unsupported ZIP file format: ${filename}`);
    const stem = filename.split("/").pop()!.slice(0, -(ext.length + 1));
    if (!/^\d+$/.test(stem)) continue;
    if (seenPhotoNumbers.has(stem)) throw new Error(`Ambiguous duplicate ZIP photo number: ${stem}`);
    seenPhotoNumbers.add(stem);
    if (!wanted.has(stem)) continue;
    if (uncompressedSize > MAX_EXPANDED_BYTES || expanded + uncompressedSize > MAX_EXPANDED_BYTES) throw new Error("ZIP expands beyond the 30 MB safety limit");
    if (localOffset + 30 > data.length || data.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`Invalid local ZIP header: ${filename}`);
    const localNameLength = data.readUInt16LE(localOffset + 26);
    const localExtraLength = data.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const end = start + compressedSize;
    if (end > data.length) throw new Error(`Truncated ZIP image: ${filename}`);
    const compressed = data.subarray(start, end);
    let bytes: Buffer;
    try {
      if (method === 0) bytes = Buffer.from(compressed);
      else if (method === 8) bytes = inflateRawSync(compressed, { maxOutputLength: Math.min(MAX_EXPANDED_BYTES, uncompressedSize + 1) });
      else throw new Error(`Unsupported ZIP compression method: ${filename}`);
    } catch { throw new Error(`Invalid or oversized ZIP image: ${filename}`); }
    if (bytes.length !== uncompressedSize || crc32(bytes) !== crc) throw new Error(`ZIP integrity check failed: ${filename}`);
    const mime = imageMime(bytes);
    if (!mime) throw new Error(`Unsupported or invalid image content: ${filename}`);
    expanded += bytes.length;
    found.set(stem, { number: stem, filename, mime, bytes });
  }
  for (const number of requestedNumbers) if (!found.has(number)) throw new Error(`Missing ZIP image for photo number ${number}`);
  return found;
}

function imageMime(bytes: Buffer) {
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function photoNumbersForCsv(value: string) { return validatePhotoNumbers(value); }
