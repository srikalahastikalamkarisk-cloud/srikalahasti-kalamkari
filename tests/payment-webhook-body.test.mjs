import test from "node:test";
import assert from "node:assert/strict";

import {
  readBoundedBody,
} from "../src/lib/payments/request-guard-stream.ts";

function streamOf(chunks) {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(chunk));
      }
      controller.close();
    },
  });
}

test("accepts a valid webhook body", async () => {
  const result = await readBoundedBody(
    streamOf(['{"event":"payment.captured"}']),
    1024
  );

  assert.equal(result.ok, true);
  assert.equal(
    new TextDecoder().decode(result.body),
    '{"event":"payment.captured"}'
  );
});

test("accepts body exactly at size limit", async () => {
  const result = await readBoundedBody(
    streamOf(["12345678"]),
    8
  );

  assert.equal(result.ok, true);
  assert.equal(result.body.length, 8);
});

test("rejects oversized webhook body", async () => {
  const result = await readBoundedBody(
    streamOf(["123456789"]),
    8
  );

  assert.deepEqual(result, {
    ok: false,
    status: 413,
  });
});

test("preserves original body bytes", async () => {
  const original = '{"event":"payment.failed","amount":50000}';

  const result = await readBoundedBody(
    streamOf([original]),
    1024
  );

  assert.equal(result.ok, true);
  assert.equal(
    Buffer.from(result.body).toString("utf8"),
    original
  );
});

test("handles empty body", async () => {
  const result = await readBoundedBody(
    streamOf([]),
    1024
  );

  assert.equal(result.ok, true);
  assert.equal(result.body.length, 0);
});
