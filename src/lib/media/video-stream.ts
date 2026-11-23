import type { Readable } from "node:stream";

export type ParsedByteRange = {
  start: number;
  end: number;
  status: 200 | 206;
};

export function parseVideoByteRange(header: string | null, size: number): ParsedByteRange | null {
  if (!Number.isSafeInteger(size) || size <= 0) return null;
  if (!header) return { start: 0, end: size - 1, status: 200 };

  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (match[1] === "" && match[2] === "")) return null;

  let start: number;
  let end: number;
  if (match[1] === "") {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix < 1) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? size - 1 : Number(match[2]);
  }

  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= size ||
    end < start
  ) return null;

  return { start, end: Math.min(end, size - 1), status: 206 };
}

/**
 * Adapts a file Readable to a pull-driven Web stream. Cancellation destroys
 * the file stream, while the terminal flags prevent late reads from enqueueing
 * or closing a response whose consumer has already cancelled it.
 */
export function readableToCancellableWebStream(source: Readable): ReadableStream<Uint8Array> {
  const iterator = source[Symbol.asyncIterator]();
  let cancelled = false;
  let completed = false;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (cancelled || completed) return;

      try {
        const next = await iterator.next();
        if (cancelled || completed) return;

        if (next.done) {
          completed = true;
          controller.close();
          return;
        }

        const bytes = typeof next.value === "string"
          ? Buffer.from(next.value)
          : new Uint8Array(next.value);
        controller.enqueue(bytes);
      } catch (error) {
        if (cancelled || completed) return;
        completed = true;
        controller.error(error instanceof Error ? error : new Error("Video stream failed"));
      }
    },
    cancel() {
      if (cancelled || completed) return;
      cancelled = true;
      source.destroy();
    },
  }, { highWaterMark: 1 });
}
