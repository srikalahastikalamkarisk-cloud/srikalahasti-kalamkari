import { open, type FileHandle } from "node:fs/promises";
import { inflateRaw } from "node:zlib";
import { promisify } from "node:util";

const inflate = promisify(inflateRaw);

export const LARGE_ZIP_BYTES = 500 * 1024 * 1024;

const MAX_EXPANDED = 500 * 1024 * 1024;
const MAX_IMAGE = 5 * 1024 * 1024;
const MAX_COMPRESSED = 6 * 1024 * 1024;
const MAX_ENTRIES = 20000;

const SUPPORTED = new Set([
  "jpg", "jpeg", "png", "webp"
]);

type Entry = {
  filename: string;
  method: number;
  flags: number;
  crc: number;
  compressed: number;
  expanded: number;
  offset: number;
};

function normalize(number: string) {
  return number.replace(/^0+(?=\d)/, "");
}

async function readExact(
  file: FileHandle,
  length: number,
  position: number
) {
  const bytes = Buffer.alloc(length);
  let offset = 0;

  while (offset < length) {
    const result = await file.read(
      bytes,
      offset,
      length - offset,
      position + offset
    );

    if (!result.bytesRead) {
      throw new Error("Truncated ZIP file");
    }

    offset += result.bytesRead;
  }

  return bytes;
}

const crcTable = Uint32Array.from(
  { length: 256 },
  (_, value) => {
    let crc = value;

    for (let i = 0; i < 8; i++) {
      crc = (crc >>> 1) ^
        ((crc & 1) ? 0xedb88320 : 0);
    }

    return crc >>> 0;
  }
);

function crc32(bytes: Buffer) {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc = (crc >>> 8) ^
      crcTable[(crc ^ byte) & 255];
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function imageMime(bytes: Buffer) {
  if (
    bytes.length >= 3 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255
  ) return "image/jpeg";

  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(
      Buffer.from([137,80,78,71,13,10,26,10])
    )
  ) return "image/png";

  if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) return "image/webp";

  throw new Error("Invalid ZIP image content");
}

export async function openLargePhotoZip(filename: string) {
  const file = await open(filename, "r");

  try {
    const info = await file.stat();

    if (
      !info.isFile() ||
      info.size < 22 ||
      info.size > LARGE_ZIP_BYTES
    ) {
      throw new Error("ZIP must be 500 MB or smaller");
    }

    const tailSize = Math.min(info.size, 65557);
    const tailOffset = info.size - tailSize;

    const tail = await readExact(
      file, tailSize, tailOffset
    );

    let end = -1;

    for (let i = tail.length - 22; i >= 0; i--) {
      if (
        tail.readUInt32LE(i) === 0x06054b50 &&
        i + 22 + tail.readUInt16LE(i + 20) === tail.length
      ) {
        end = i;
        break;
      }
    }

    if (end < 0) {
      throw new Error("Invalid ZIP end record");
    }

    if (
      tail.readUInt16LE(end + 4) ||
      tail.readUInt16LE(end + 6)
    ) {
      throw new Error("Multi-disk ZIP is not supported");
    }

    const count = tail.readUInt16LE(end + 10);
    const centralSize = tail.readUInt32LE(end + 12);
    const centralStart = tail.readUInt32LE(end + 16);
    const centralEnd = centralStart + centralSize;

    if (
      count > MAX_ENTRIES ||
      tail.readUInt16LE(end + 8) !== count ||
      centralEnd > tailOffset + end ||
      centralSize > 16 * 1024 * 1024
    ) {
      throw new Error("Invalid or oversized ZIP directory");
    }

    const entries = new Map<string, Entry>();

    let cursor = centralStart;
    let expandedTotal = 0;

    for (let i = 0; i < count; i++) {
      if (cursor + 46 > centralEnd) {
        throw new Error("Truncated ZIP directory");
      }

      const header = await readExact(file, 46, cursor);

      if (header.readUInt32LE(0) !== 0x02014b50) {
        throw new Error("Invalid ZIP directory entry");
      }

      const nameLength = header.readUInt16LE(28);
      const extraLength = header.readUInt16LE(30);
      const commentLength = header.readUInt16LE(32);

      const next = cursor + 46 +
        nameLength + extraLength + commentLength;

      if (
        !nameLength ||
        nameLength > 4096 ||
        next > centralEnd
      ) {
        throw new Error("Invalid ZIP filename");
      }

      const name = (
        await readExact(file, nameLength, cursor + 46)
      ).toString("utf8");

      cursor = next;

      if (
        name.includes("\\") ||
        name.includes("\0") ||
        name.startsWith("/") ||
        /^[a-zA-Z]:/.test(name) ||
        name.split("/").some(p => p === ".." || p === ".")
      ) {
        throw new Error(`Unsafe ZIP path: ${name}`);
      }

      const mode = header.readUInt16LE(4) >> 8 === 3
        ? header.readUInt32LE(38) >>> 16
        : 0;

      if ((mode & 0xf000) === 0xa000) {
        throw new Error(`ZIP symlink rejected: ${name}`);
      }

      const flags = header.readUInt16LE(8);

      if (flags & 1) {
        throw new Error("Encrypted ZIP is not supported");
      }

      const expanded = header.readUInt32LE(24);
      const compressed = header.readUInt32LE(20);
      const offset = header.readUInt32LE(42);

      if (
        expanded === 0xffffffff ||
        compressed === 0xffffffff ||
        offset === 0xffffffff ||
        header.readUInt16LE(34) !== 0
      ) {
        throw new Error("ZIP64 or split ZIP is not supported");
      }

      expandedTotal += expanded;

      if (expandedTotal > MAX_EXPANDED) {
        throw new Error("ZIP expanded content exceeds 500 MB");
      }

      if (
        name.endsWith("/") ||
        name.split("/").some(part =>
          part === "__MACOSX" ||
          part === ".DS_Store" ||
          part.startsWith("._")
        )
      ) continue;

      const base = name.split("/").pop()!;
      const ext = base.split(".").pop()!.toLowerCase();

      if (!SUPPORTED.has(ext)) {
        throw new Error(`Unsupported ZIP file format: ${name}`);
      }

      const stem = base.slice(0, -(ext.length + 1));

      if (!/^\d+$/.test(stem)) continue;

      const number = normalize(stem);

      if (entries.has(number)) {
        throw new Error(`Ambiguous duplicate ZIP photo number: ${number}`);
      }

      const method = header.readUInt16LE(10);

      if (
        expanded < 1 ||
        expanded > MAX_IMAGE ||
        compressed > MAX_COMPRESSED ||
        offset + 30 > centralStart ||
        ![0, 8].includes(method)
      ) {
        throw new Error(`Invalid or oversized ZIP image: ${name}`);
      }

      entries.set(number, {
        filename: name,
        method,
        flags,
        crc: header.readUInt32LE(16),
        compressed,
        expanded,
        offset
      });
    }

    if (cursor !== centralEnd) {
      throw new Error("ZIP directory size mismatch");
    }

    return {
      has(number: string) {
        return entries.has(normalize(number));
      },

      async read(number: string) {
        const entry = entries.get(normalize(number));

        if (!entry) {
          throw new Error(`Missing ZIP image for photo number ${number}`);
        }

        const local = await readExact(file, 30, entry.offset);

        if (
          local.readUInt32LE(0) !== 0x04034b50 ||
          local.readUInt16LE(8) !== entry.method ||
          local.readUInt16LE(6) !== entry.flags
        ) {
          throw new Error("Invalid local ZIP header");
        }

        const nameLength = local.readUInt16LE(26);
        const extraLength = local.readUInt16LE(28);

        const start = entry.offset + 30 +
          nameLength + extraLength;

        if (start + entry.compressed > centralStart) {
          throw new Error("Truncated ZIP image");
        }

        const localName = await readExact(
          file, nameLength, entry.offset + 30
        );

        if (localName.toString("utf8") !== entry.filename) {
          throw new Error("ZIP filename mismatch");
        }

        const compressed = await readExact(
          file, entry.compressed, start
        );

        const bytes = entry.method === 0
          ? compressed
          : await inflate(compressed, {
              maxOutputLength: entry.expanded + 1
            });

        if (
          bytes.length !== entry.expanded ||
          crc32(bytes) !== entry.crc
        ) {
          throw new Error("ZIP image integrity check failed");
        }

        return {
          number,
          filename: entry.filename,
          mime: imageMime(bytes),
          bytes
        };
      },

      close() {
        return file.close();
      }
    };
  } catch (error) {
    await file.close();
    throw error;
  }
}
