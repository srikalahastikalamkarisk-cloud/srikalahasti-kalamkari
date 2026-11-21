import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const form = readFileSync("src/components/admin/add-product-form.tsx", "utf8");
const variantsRoute = readFileSync("src/app/api/admin/products/[id]/variants/route.ts", "utf8");

test("existing Product Variations form owns color, size, length and custom attributes", () => {
  assert.match(form, /<h2>Product Variations<\/h2>/);
  assert.match(form, /Enable Product Colors/);
  assert.match(form, /Enable Size Preferences/);
  assert.match(form, /Enable Length/);
  assert.match(form, /Add Custom Attribute/);
  assert.match(form, /Generate \/ Update Combinations/);
  assert.doesNotMatch(form, /ProductVariantsEditor/);
});

test("product and variant persistence share the existing product form submit", () => {
  const productSave = form.indexOf("await fetch(", form.indexOf("async function submit"));
  const variantSave = form.indexOf("/variants`, {", productSave);
  const submitEnd = form.indexOf("router.push(", variantSave);
  assert.ok(productSave >= 0 && variantSave > productSave && submitEnd > variantSave);
  assert.match(form, /Product details saved, but variant save failed/);
  assert.match(form, /setCreatedProductId\(savedProductId\)/);
  assert.match(form, /Unsaved variant changes/);
});

test("variant synchronization preserves matched IDs and retires removed combinations safely", () => {
  assert.match(variantsRoute, /id: z\.string\(\)\.trim\(\)\.min\(1\)\.max\(191\)\.optional\(\)/);
  assert.match(variantsRoute, /tx\.productVariant\.update\(\{ where: \{ id: existing\.id \}, data \}\)/);
  assert.match(variantsRoute, /Keep removed combinations as inactive rows/);
  assert.doesNotMatch(variantsRoute, /tx\.productVariant\.delete/);
});
