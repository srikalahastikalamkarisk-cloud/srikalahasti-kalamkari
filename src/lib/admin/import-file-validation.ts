export const CSV_IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const ZIP_IMPORT_MAX_BYTES = 20 * 1024 * 1024;

type ImportFile = { name: string; size: number };

export function validateCsvImportFile(file: ImportFile) {
  if (!file.name.toLowerCase().endsWith(".csv")) return "Choose a .csv file.";
  if (file.size > CSV_IMPORT_MAX_BYTES) return "CSV must be 2 MB or smaller.";
  if (!file.size) return "The selected CSV is empty.";
  return "";
}

export function validateZipImportFile(file: ImportFile) {
  if (!file.name.toLowerCase().endsWith(".zip")) return "Choose a .zip archive.";
  if (!file.size) return "The selected ZIP is empty.";
  if (file.size > ZIP_IMPORT_MAX_BYTES) return "ZIP must be 20 MB or smaller.";
  return "";
}
