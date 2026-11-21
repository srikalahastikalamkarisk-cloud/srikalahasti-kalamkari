import test from "node:test";
import assert from "node:assert/strict";
import { parseCsvRows } from "../src/lib/admin/csv-import";

test("CSV parser handles quoted commas, escaped quotes, and CRLF", () => {
  assert.deepEqual(parseCsvRows('name,description\r\n"Saree, hand block printed","Said ""hello"""\r\n'), [
    ["name", "description"], ["Saree, hand block printed", 'Said "hello"'],
  ]);
});

test("CSV parser rejects an unclosed quoted field", () => {
  assert.throws(() => parseCsvRows('name,description\n"unfinished'), /unclosed quoted field/);
});
