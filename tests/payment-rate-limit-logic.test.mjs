import test from "node:test";
import assert from "node:assert/strict";

function nextCount(existing, now, windowMs = 60000) {
  if (!existing || existing.expiresAt <= now) {
    return { count: 1, expiresAt: now + windowMs };
  }

  return {
    count: existing.count + 1,
    expiresAt: existing.expiresAt,
  };
}

test("first request starts counter", () => {
  assert.deepEqual(nextCount(null, 1000), {
    count: 1,
    expiresAt: 61000,
  });
});

test("first ten requests allowed", () => {
  let state = null;

  for (let i = 0; i < 10; i++) {
    state = nextCount(state, 1000);
    assert.ok(state.count <= 10);
  }

  assert.equal(state.count, 10);
});

test("eleventh request denied", () => {
  const state = nextCount(
    { count: 10, expiresAt: 61000 },
    2000
  );

  assert.equal(state.count, 11);
  assert.equal(state.count <= 10, false);
});

test("expired window resets counter", () => {
  const state = nextCount(
    { count: 50, expiresAt: 61000 },
    61000
  );

  assert.equal(state.count, 1);
  assert.equal(state.expiresAt, 121000);
});

test("active window keeps original expiry", () => {
  const state = nextCount(
    { count: 3, expiresAt: 61000 },
    5000
  );

  assert.equal(state.count, 4);
  assert.equal(state.expiresAt, 61000);
});
