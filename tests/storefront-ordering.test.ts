import test from "node:test";
import assert from "node:assert/strict";
import { restoreRequestedOrder } from "../src/lib/storefront-ordering";

test("restores bounded homepage query order after an IN query", () => {
  const fetched = [
    { id: "newer-unfeatured" },
    { id: "featured-newest" },
    { id: "featured-oldest" },
  ];

  const ordered = restoreRequestedOrder(fetched, [
    "featured-newest",
    "featured-oldest",
    "newer-unfeatured",
  ]);

  assert.deepEqual(ordered.map(product => product.id), [
    "featured-newest",
    "featured-oldest",
    "newer-unfeatured",
  ]);
  assert.deepEqual(fetched.map(product => product.id), [
    "newer-unfeatured",
    "featured-newest",
    "featured-oldest",
  ]);
});

test("keeps unexpected query rows after requested rows without changing their relative order", () => {
  const ordered = restoreRequestedOrder(
    [{ id: "extra-b" }, { id: "requested-b" }, { id: "extra-a" }, { id: "requested-a" }],
    ["requested-a", "requested-b"],
  );

  assert.deepEqual(ordered.map(product => product.id), [
    "requested-a",
    "requested-b",
    "extra-b",
    "extra-a",
  ]);
});
