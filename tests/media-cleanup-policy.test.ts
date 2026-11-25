import assert from "node:assert/strict";
import test from "node:test";
import { MEDIA_CLEANUP_MAX_ATTEMPTS, MEDIA_CLEANUP_RETRY_MAX_MS, nextJobStatus, retryAt } from "../src/lib/admin/media-cleanup-policy";

test("cleanup retries use capped exponential backoff", () => {
  const now = 1_000;
  assert.equal(retryAt(1, now).getTime(), now + 30_000);
  assert.equal(retryAt(2, now).getTime(), now + 60_000);
  assert.equal(retryAt(20, now).getTime(), now + MEDIA_CLEANUP_RETRY_MAX_MS);
});

test("cleanup jobs become dead at the configured attempt limit", () => {
  assert.equal(nextJobStatus(MEDIA_CLEANUP_MAX_ATTEMPTS - 1), "FAILED");
  assert.equal(nextJobStatus(MEDIA_CLEANUP_MAX_ATTEMPTS), "DEAD");
});
