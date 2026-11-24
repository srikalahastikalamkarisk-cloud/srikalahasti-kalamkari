import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const form = readFileSync("src/components/admin/add-product-form.tsx", "utf8");
const variantRoute = readFileSync("src/app/api/admin/products/[id]/variants/route.ts", "utf8");
const importRoute = readFileSync("src/app/api/admin/products/import/route.ts", "utf8");

test("variant edits keep active products hidden until product and variant saves both succeed", () => {
  const suspend = form.indexOf("const firstSavePayload = pendingActivation ? { ...payload, isActive: false } : payload");
  const variants = form.indexOf("/variants`, {", suspend);
  const activate = form.indexOf("if (pendingActivation)", variants);
  assert.ok(suspend >= 0 && variants > suspend && activate > variants);
  assert.match(form, /Variant save failed and this product remains inactive/);
  assert.match(form, /remains inactive because activation failed/);
});

test("variant edits preserve an explicitly selected Out of Stock state", () => {
  assert.match(variantRoute, /product\.availabilityStatus === "IN_STOCK" && stock === 0/);
  assert.doesNotMatch(variantRoute, /stock > 0 \? "IN_STOCK" : "OUT_OF_STOCK"/);
});

test("active variants require a usable selling price in both variant save and CSV import APIs", () => {
  assert.match(variantRoute, /data\.isActive && \(data\.price == null \|\| data\.price <= 0\)/);
  assert.match(importRoute, /variant\.isActive && \(variant\.price == null \|\| variant\.price <= 0\)/);
});

test("variant stock updates serialize on the product row and record aggregate inventory movements", () => {
  assert.match(variantRoute, /SELECT id FROM Product WHERE id = \$\{id\} FOR UPDATE/);
  assert.match(variantRoute, /recordInventoryMovement\(tx/);
  assert.match(variantRoute, /note: "Variant inventory updated"/);
});


test("variant combination duplicate checks use the same normalized key as variant matching", () => {
  assert.match(variantRoute, /const combinations = variants\.map\(variant => canonicalAttributes\(variant\)\)/);
  assert.match(variantRoute, /toLowerCase\(\)/);
});
