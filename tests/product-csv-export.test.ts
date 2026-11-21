import test from "node:test";
import assert from "node:assert/strict";
import { csvRow, imageUrlsFromJson, jsonCsvCell, protectCsvFormula } from "../src/lib/admin/product-csv";
import { PRODUCT_IMPORT_COLUMNS, normalizeProductImportHeader } from "../src/lib/admin/product-import-columns";
import { parseCsvRows } from "../src/lib/admin/csv-import";

test("shared export/template headers normalize to fields accepted by the importer", () => {
  const normalized = PRODUCT_IMPORT_COLUMNS.map(normalizeProductImportHeader);
  for (const required of ["name", "sku", "slug", "category", "subcategory", "description", "pricingMode", "price", "compareAtPrice", "pricePerMeter", "stock", "photoNumbers", "imageUrls", "colorsJson", "sizesJson", "meterOptionsJson", "specificationsJson", "variantsJson", "storefrontSettingsJson"]) {
    assert.ok(normalized.includes(required), `missing import field ${required}`);
  }
  assert.equal(normalizeProductImportHeader("Product ID"), "productId");
  assert.equal(normalizeProductImportHeader("Original Price"), "compareAtPrice");
});

test("CSV export quotes cells and neutralizes spreadsheet formulas", () => {
  assert.equal(protectCsvFormula("=HYPERLINK(\"x\")"), "'=HYPERLINK(\"x\")");
  assert.equal(protectCsvFormula("  @SUM(A1:A2)"), "'  @SUM(A1:A2)");
  assert.equal(protectCsvFormula("Saree, hand printed"), "Saree, hand printed");
  const line = csvRow(["Safe product", "=2+2", "line 1\nline 2"]);
  assert.deepEqual(parseCsvRows(line), [["Safe product", "'=2+2", "line 1\nline 2"]]);
});

test("exported image and JSON cells retain importer-compatible data", () => {
  const images = ["/api/media/products/00000000-0000-0000-0000-000000000000.jpg", "https://images.example/item.png"];
  assert.deepEqual(imageUrlsFromJson(images), images);
  assert.deepEqual(imageUrlsFromJson(JSON.stringify(images)), images);
  const variants = [{ sku: "approved-sku", colorName: "Blue", price: 12, stock: 3, isActive: true }];
  assert.deepEqual(JSON.parse(jsonCsvCell(variants)), variants);
});
