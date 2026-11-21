export function protectCsvFormula(value: unknown): string {
  const text = value == null ? "" : typeof value === "string" ? value : String(value);
  return /^[\u0000-\u0020]*[=+\-@]/.test(text) ? `'${text}` : text;
}

export function csvCell(value: unknown): string {
  return `"${protectCsvFormula(value).replaceAll('"', '""')}"`;
}

export function csvRow(values: readonly unknown[]): string {
  return values.map(csvCell).join(",") + "\r\n";
}

export function jsonCsvCell(value: unknown): string {
  return value == null ? "" : JSON.stringify(value);
}

export function imageUrlsFromJson(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && !!item.trim());
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === "string" && !!item.trim());
    } catch { return [value]; }
  }
  return [];
}
