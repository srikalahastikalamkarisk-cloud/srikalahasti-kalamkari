import test from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { extractPhotoZip, MAX_ZIP_BYTES } from "../src/lib/admin/photo-zip";

function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(files: Array<{ name: string; bytes?: Buffer; mode?: number }>) {
  const locals: Buffer[] = [], centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const bytes = file.bytes ?? Buffer.from([255, 216, 255, 0]);
    const compressed = deflateRawSync(bytes);
    const crc = crc32(bytes);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 6);
    local.writeUInt16LE(8, 8); local.writeUInt32LE(crc, 14); local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(bytes.length, 22); local.writeUInt16LE(name.length, 26); name.copy(local, 30);
    locals.push(local, compressed);
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(file.mode ? 0x0314 : 20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 8); central.writeUInt16LE(8, 10); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(bytes.length, 24);
    central.writeUInt16LE(name.length, 28); central.writeUInt32LE(file.mode ? (file.mode << 16) >>> 0 : 0, 38);
    central.writeUInt32LE(offset, 42); name.copy(central, 46); centrals.push(central);
    offset += local.length + compressed.length;
  }
  const centralBytes = Buffer.concat(centrals);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10); end.writeUInt32LE(centralBytes.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBytes, end]);
}

test("ZIP maps supported exact numbered filenames and preserves requested ordering", () => {
  const webp = Buffer.from("RIFF0000WEBP");
  const archive = zip([
    { name: "101.jpg" },
    { name: "folder/102.png", bytes: Buffer.from([137,80,78,71,13,10,26,10]) },
    { name: "nested/12810.jpeg" },
    { name: "1281.webp", bytes: webp },
  ]);
  const found = extractPhotoZip(archive, ["1281", "102", "101"]);
  assert.deepEqual([found.get("1281")?.filename, found.get("102")?.filename, found.get("101")?.filename], ["1281.webp", "folder/102.png", "101.jpg"]);
  assert.equal(found.has("12810"), false);
});

test("ZIP rejects missing, ambiguous, unsupported, and traversal matches", () => {
  assert.throws(() => extractPhotoZip(zip([{ name: "1.jpg" }]), ["2"]), /Missing ZIP image/);
  assert.throws(() => extractPhotoZip(zip([{ name: "1.jpg" }, { name: "1.png", bytes: Buffer.from([137,80,78,71,13,10,26,10]) }]), ["1"]), /Ambiguous duplicate/);
  assert.throws(() => extractPhotoZip(zip([{ name: "1.gif" }]), ["1"]), /Unsupported ZIP file format/);
  assert.throws(() => extractPhotoZip(zip([{ name: "../1.jpg" }]), ["1"]), /Unsafe ZIP path/);
});

test("ZIP rejects symlinks and archives beyond conservative size limit", () => {
  assert.throws(() => extractPhotoZip(zip([{ name: "1.jpg", mode: 0xa1ff }]), ["1"]), /symlink/);
  assert.throws(() => extractPhotoZip(Buffer.alloc(MAX_ZIP_BYTES + 1), []), /20 MB/);
});
