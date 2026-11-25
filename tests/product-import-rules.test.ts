import test from "node:test";
import assert from "node:assert/strict";
import {
  importSlugBase, normalizeImportLabel, nonEmptyImportColumns,
  resolveImportMatch, uniqueImportSlug,
} from "../src/lib/admin/product-import-rules";

test("category labels match after Unicode normalization and whitespace folding", () => {
  assert.equal(normalizeImportLabel("  Hand   Block  "), normalizeImportLabel("hand block"));
  assert.equal(normalizeImportLabel("Cafe\u0301"), normalizeImportLabel("Café"));
});

test("generated category and product slugs are valid and collision-free", () => {
  assert.equal(importSlugBase("  Kalamkari / Sarees! "), "kalamkari-sarees");
  assert.equal(uniqueImportSlug("Kalamkari", ["kalamkari", "kalamkari-2"]), "kalamkari-3");
  assert.match(uniqueImportSlug("***", ["category"]), /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
});

test("matching product identifiers resolve one record and reject split matches", () => {
  const productA = { id: "a" }, productB = { id: "b" };
  assert.deepEqual(resolveImportMatch([productA, productA, null]), { product: productA, conflict: false });
  assert.deepEqual(resolveImportMatch([productA, productB]), { product: null, conflict: true });
  assert.deepEqual(resolveImportMatch([null, undefined]), { product: null, conflict: false });
});

test("explicit false and zero remain supplied values while blank update cells are omitted", () => {
  assert.deepEqual([...nonEmptyImportColumns(["stock", "active", "description"], ["0", "false", "   "])], ["stock", "active"]);
});
