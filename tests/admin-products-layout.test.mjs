import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../src/components/admin/products-manager.css", import.meta.url), "utf8");

test("product filters can escape the panel while table overflow stays contained", () => {
  assert.match(css, /\.skpm-panel\s*\{[^}]*overflow:\s*visible\s*;/s);
  assert.match(css, /\.skpm-table-scroll\s*\{[^}]*overflow-x:\s*auto\s*;/s);
  assert.match(css, /\.skpm-table-scroll\s*\{[^}]*overscroll-behavior-x:\s*contain\s*;/s);
});

test("narrow product pages switch to cards and let filters shrink to the viewport", () => {
  assert.match(css, /@media\s*\(max-width:\s*650px\)[\s\S]*?\.skpm-table-scroll\s*\{\s*display:\s*none\s*;\s*\}/);
  assert.match(css, /@media\s*\(max-width:\s*650px\)[\s\S]*?\.skpm-mobile-cards\s*\{\s*display:\s*grid\s*;/);
  assert.match(css, /\.skpm-dropdown\s*\{[^}]*min-width:\s*0\s*;[^}]*flex:\s*none\s*;/s);
  assert.match(css, /\.skpm-filters select,\s*\.skpm-search\s*\{[^}]*min-width:\s*0\s*;/s);
  assert.match(css, /\.skpm-page\s*\{[^}]*box-sizing:\s*border-box\s*;/s);
});
