import test from "node:test";
import assert from "node:assert/strict";
import { heroMediaUrl } from "../src/lib/hero-media-url";

test("Hero Manager uses the persistent media route for library images", () => {
  assert.equal(heroMediaUrl("123e4567-e89b-12d3-a456-426614174000.webp"), "/api/media/products/123e4567-e89b-12d3-a456-426614174000.webp");
  assert.throws(() => heroMediaUrl("../private.jpg"), /Invalid hero image/);
});
