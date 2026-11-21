import test from "node:test";
import assert from "node:assert/strict";

import {
  checkPaymentRequest,
} from "../src/lib/payments/request-guard-core.ts";

const valid = {
  origin: "http://localhost:3000",
  requestOrigin: "http://localhost:3000",
  contentType: "application/json",
  contentLength: "100",
};

test("rejects missing Origin", () => {
  assert.deepEqual(
    checkPaymentRequest({ ...valid, origin: null }),
    { allowed: false, status: 403 }
  );
});

test("rejects mismatched Origin", () => {
  assert.equal(
    checkPaymentRequest({
      ...valid,
      origin: "https://attacker.example",
    }).status,
    403
  );
});

test("rejects incorrect content type", () => {
  assert.equal(
    checkPaymentRequest({
      ...valid,
      contentType: "text/plain",
    }).status,
    415
  );
});

test("rejects oversized body", () => {
  assert.equal(
    checkPaymentRequest({
      ...valid,
      contentLength: "9000",
    }).status,
    413
  );
});

test("allows valid same-origin JSON", () => {
  assert.deepEqual(checkPaymentRequest(valid), { allowed: true });
});

test("rejects invalid content length", () => {
  assert.equal(
    checkPaymentRequest({
      ...valid,
      contentLength: "-1",
    }).status,
    413
  );
});

test("rejects JSON with an unsupported media type suffix", () => {
  assert.equal(
    checkPaymentRequest({
      ...valid,
      contentType: "application/jsonp",
    }).status,
    415
  );
});

import {
  readBoundedBody,
} from "../src/lib/payments/request-guard-stream.ts";

test("accepts a streamed body within 8 KB", async () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("valid payment"));
      controller.close();
    },
  });

  const result = await readBoundedBody(stream);

  assert.equal(result.ok, true);

  if (result.ok) {
    assert.equal(
      new TextDecoder().decode(result.body),
      "valid payment"
    );
  }
});

test("rejects streamed body exceeding 8 KB without Content-Length", async () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(5000));
      controller.enqueue(new Uint8Array(4000));
      controller.close();
    },
  });

  assert.deepEqual(
    await readBoundedBody(stream),
    { ok: false, status: 413 }
  );
});

test("accepts a body exactly at the 8 KB limit", async () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(8192));
      controller.close();
    },
  });

  const result = await readBoundedBody(stream);

  assert.equal(result.ok, true);

  if (result.ok) {
    assert.equal(result.body.byteLength, 8192);
  }
});

test("rejects interrupted streams safely", async () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.error(new Error("Simulated stream failure"));
    },
  });

  assert.deepEqual(
    await readBoundedBody(stream),
    { ok: false, status: 400 }
  );
});
