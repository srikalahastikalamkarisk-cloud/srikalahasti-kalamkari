import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

export const LARGE_CSV_BYTES = 100 * 1024 * 1024;
export const LARGE_CSV_ROWS = 1000;

const MAX_CELL_CHARS = 256 * 1024;
const MAX_ROW_CHARS = 512 * 1024;
const MAX_COLUMNS = 256;

export async function* streamImportCsv(
  filename: string
): AsyncGenerator<string[]> {
  const info = await stat(filename);

  if (
    !info.isFile() ||
    info.size < 1 ||
    info.size > LARGE_CSV_BYTES
  ) {
    throw new Error("CSV must be between 1 byte and 100 MB");
  }

  const stream = createReadStream(filename, {
    encoding: "utf8",
    highWaterMark: 64 * 1024
  });

  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let pendingQuote = false;
  let skipLF = false;
  let rowChars = 0;
  let count = 0;
  let first = true;

  function pushCell() {
    row.push(cell);
    cell = "";

    if (row.length > MAX_COLUMNS) {
      throw new Error("CSV contains too many columns");
    }
  }

  function append(char: string) {
    cell += char;

    if (cell.length > MAX_CELL_CHARS) {
      throw new Error("CSV field exceeds the safety limit");
    }
  }

  function finishRow() {
    pushCell();

    const result = row;
    row = [];
    rowChars = 0;

    if (!result.some(value => value.trim())) return null;

    count++;

    if (count > LARGE_CSV_ROWS + 1) {
      throw new Error("Import supports at most 1000 products");
    }

    return result;
  }

  try {
    for await (const chunk of stream) {
      for (const char of String(chunk)) {
        if (first) {
          first = false;
          if (char === "\uFEFF") continue;
        }

        if (skipLF) {
          skipLF = false;
          if (char === "\n") continue;
        }

        rowChars++;

        if (rowChars > MAX_ROW_CHARS) {
          throw new Error("CSV row exceeds the safety limit");
        }

        if (pendingQuote) {
          pendingQuote = false;

          if (char === '"') {
            append('"');
            continue;
          }

          quoted = false;
        }

        if (char === '"') {
          if (quoted) pendingQuote = true;
          else quoted = true;
          continue;
        }

        if (quoted) {
          append(char);
          continue;
        }

        if (char === ",") {
          pushCell();
          continue;
        }

        if (char === "\r" || char === "\n") {
          if (char === "\r") skipLF = true;

          const result = finishRow();
          if (result) yield result;
          continue;
        }

        append(char);
      }
    }

    if (pendingQuote) quoted = false;

    if (quoted) {
      throw new Error("CSV contains an unclosed quoted field");
    }

    if (cell.length || row.length) {
      const result = finishRow();
      if (result) yield result;
    }
  } finally {
    stream.destroy();
  }
}
