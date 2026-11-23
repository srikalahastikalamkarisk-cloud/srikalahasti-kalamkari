import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { parseVideoByteRange, readableToCancellableWebStream } from "../src/lib/media/video-stream";

test("video byte ranges support full, explicit, open-ended, suffix, and invalid requests", () => {
  assert.deepEqual(parseVideoByteRange(null, 10), { start: 0, end: 9, status: 200 });
  assert.deepEqual(parseVideoByteRange("bytes=2-4", 10), { start: 2, end: 4, status: 206 });
  assert.deepEqual(parseVideoByteRange("bytes=6-", 10), { start: 6, end: 9, status: 206 });
  assert.deepEqual(parseVideoByteRange("bytes=-3", 10), { start: 7, end: 9, status: 206 });
  assert.deepEqual(parseVideoByteRange("bytes=8-99", 10), { start: 8, end: 9, status: 206 });
  assert.equal(parseVideoByteRange("bytes=10-", 10), null);
  assert.equal(parseVideoByteRange("bytes=4-2", 10), null);
  assert.equal(parseVideoByteRange("bytes=--", 10), null);
  assert.equal(parseVideoByteRange(null, 0), null);
});

test("cancellable Web stream transfers chunks without buffering the full source", async () => {
  const source = Readable.from([
    Buffer.from("first-"),
    Buffer.from("second"),
  ]);
  const response = new Response(readableToCancellableWebStream(source));
  assert.equal(await response.text(), "first-second");
  assert.equal(source.destroyed, true);
});

test("cancellation destroys a pending source and ignores its late read", async () => {
  const source = new Readable({
    read() {
      setTimeout(() => this.push(Buffer.from("late")), 20);
    },
  });
  const reader = readableToCancellableWebStream(source).getReader();
  const pendingRead = reader.read();
  await reader.cancel("navigation");
  const readResult = await pendingRead;

  assert.equal(readResult.done, true);
  assert.equal(source.destroyed, true);
});
