export function normalizeImportLabel(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

export function importSlugBase(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 170) || "category";
}

export function uniqueImportSlug(value: string, used: Iterable<string>) {
  const occupied = new Set(used);
  const base = importSlugBase(value);
  let candidate = base;
  for (let suffix = 2; occupied.has(candidate); suffix++) candidate = `${base}-${suffix}`;
  return candidate;
}

export function resolveImportMatch<T extends { id: string }>(candidates: Array<T | null | undefined>) {
  const matches = [...new Map(candidates.filter((value): value is T => Boolean(value)).map(value => [value.id, value])).values()];
  return matches.length > 1
    ? { product: null, conflict: true }
    : { product: matches[0] ?? null, conflict: false };
}

export function nonEmptyImportColumns(headers: string[], cells: string[]) {
  return new Set(headers.filter((_header, index) => (cells[index] ?? "").trim().length > 0));
}
