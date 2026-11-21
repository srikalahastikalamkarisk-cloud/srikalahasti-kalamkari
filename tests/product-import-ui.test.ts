import test from "node:test";
import assert from "node:assert/strict";
import {
  CSV_IMPORT_MAX_BYTES, ZIP_IMPORT_MAX_BYTES,
  validateCsvImportFile, validateZipImportFile,
} from "../src/lib/admin/import-file-validation";

test("CSV upload selection validates extension, non-empty content and the supported size", () => {
  assert.equal(validateCsvImportFile({ name: "catalog.CSV", size: CSV_IMPORT_MAX_BYTES }), "");
  assert.match(validateCsvImportFile({ name: "catalog.txt", size: 12 }), /\.csv/);
  assert.match(validateCsvImportFile({ name: "empty.csv", size: 0 }), /empty/);
  assert.match(validateCsvImportFile({ name: "oversized.csv", size: CSV_IMPORT_MAX_BYTES + 1 }), /2 MB/);
});

test("optional ZIP selection validates extension, non-empty content and the 20 MB cap", () => {
  assert.equal(validateZipImportFile({ name: "photos.ZIP", size: ZIP_IMPORT_MAX_BYTES }), "");
  assert.match(validateZipImportFile({ name: "photos.rar", size: 12 }), /\.zip/);
  assert.match(validateZipImportFile({ name: "empty.zip", size: 0 }), /empty/);
  assert.match(validateZipImportFile({ name: "oversized.zip", size: ZIP_IMPORT_MAX_BYTES + 1 }), /20 MB/);
  assert.match(validateZipImportFile({ name: "one-gib.zip", size: 1024 ** 3 }), /20 MB/);
});
