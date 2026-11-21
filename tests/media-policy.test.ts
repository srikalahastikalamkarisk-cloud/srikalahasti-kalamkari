import test from "node:test";
import assert from "node:assert/strict";
import { canGloballyDelete, detachImage } from "../src/lib/admin/media-policy";

test("detaching a product image preserves gallery order and promotes the next main image", () => {
  assert.deepEqual(detachImage(["first", "remove", "third"], "first"), ["remove", "third"]);
  assert.deepEqual(detachImage(["first", "remove", "third"], "remove"), ["first", "third"]);
});

test("global deletion fails closed when references are untracked", () => {
  assert.equal(canGloballyDelete({ untrackedProductReferences: 0, unsupportedPlacements: 0 }), true);
  assert.equal(canGloballyDelete({ untrackedProductReferences: 1, unsupportedPlacements: 0 }), false);
  assert.equal(canGloballyDelete({ untrackedProductReferences: 0, unsupportedPlacements: 1 }), false);
});
