import test from "node:test";
import assert from "node:assert/strict";
import { logVideoUploadFailure, VideoProcessingError } from "../src/lib/admin/video-processing-errors";

test("video upload diagnostics include request context without leaking child process details", () => {
  const records: string[] = [];
  const original = console.error;
  console.error = (...values: unknown[]) => records.push(values.map(String).join(" "));
  try {
    logVideoUploadFailure({
      requestId: "request-test-id",
      endpoint: "hero",
      inputBytes: 1234,
      elapsedMs: 55.4,
      error: new VideoProcessingError("encoding_failed", "encode", "/private/media/secret.mov failed", Object.assign(new Error("password=private raw ffmpeg stderr"), { code: 1, signal: "SIGKILL", killed: true })),
    });
  } finally {
    console.error = original;
  }
  assert.equal(records.length, 1);
  assert.match(records[0], /request-test-id/);
  assert.match(records[0], /encoding_failed/);
  assert.match(records[0], /"signal":"SIGKILL"/);
  assert.match(records[0], /"timedOut":true/);
  assert.doesNotMatch(records[0], /private\/media|secret\.mov|password=|raw ffmpeg stderr/);
});
