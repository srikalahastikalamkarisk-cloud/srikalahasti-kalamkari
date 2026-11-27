import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  streamImportCsv,
  LARGE_CSV_BYTES
} from "../src/lib/admin/large-csv-reader";
import {
  openLargePhotoZip,
  LARGE_ZIP_BYTES
} from "../src/lib/admin/large-zip-reader";

test("Large import limits", () => {
  assert.equal(LARGE_CSV_BYTES, 100 * 1024 * 1024);
  assert.equal(LARGE_ZIP_BYTES, 500 * 1024 * 1024);
});

test("Streaming CSV handles BOM, quotes and multiline fields", async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "sk-csv-test-")
  );

  try {
    const filename = path.join(directory, "products.csv");

    await writeFile(
      filename,
      '\uFEFFName,Description,Price\r\n' +
      '"Saree","Handmade, Kalamkari",1500\r\n' +
      '"Dupatta","Line one\nLine two",900\r\n' +
      '"Fabric","Premium ""Cotton""",500\r\n'
    );

    const rows: string[][] = [];

    for await (const row of streamImportCsv(filename)) {
      rows.push(row);
    }

    assert.deepEqual(rows, [
      ["Name", "Description", "Price"],
      ["Saree", "Handmade, Kalamkari", "1500"],
      ["Dupatta", "Line one\nLine two", "900"],
      ["Fabric", 'Premium "Cotton"', "500"]
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("CSV supports 1000 products and rejects excess rows", async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "sk-csv-count-")
  );

  try {
    const filename = path.join(directory, "products.csv");

    await writeFile(
      filename,
      "Name,Price\n" +
      Array.from(
        { length: 1000 },
        (_, i) => `Product ${i},100`
      ).join("\n")
    );

    let count = 0;

    for await (const row of streamImportCsv(filename)) {
      assert.equal(row.length, 2);
      count++;
    }

    assert.equal(count, 1001);

    await writeFile(
      filename,
      "Name\n" + "Product\n".repeat(1001)
    );

    await assert.rejects(async () => {
      for await (const row of streamImportCsv(filename)) {
        void row;
      }
    }, /1000 products/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Invalid ZIP content is rejected", async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "sk-invalid-zip-")
  );

  try {
    const filename = path.join(directory, "invalid.zip");

    await writeFile(filename, Buffer.alloc(100));

    await assert.rejects(
      () => openLargePhotoZip(filename),
      /Invalid ZIP/
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
