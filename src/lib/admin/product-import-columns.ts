export const PRODUCT_IMPORT_COLUMNS = [
  "Product ID", "Product Name", "SKU", "Slug", "Category", "Subcategory",
  "Short Description", "Long Description", "Pricing Mode", "Price", "Original Price",
  "Price Per Meter", "Stock", "Availability Status", "Photo Numbers", "Image URLs",
  "Colors JSON", "Sizes JSON", "Fixed Length Options JSON", "Specifications JSON",
  "Universal Variants JSON", "Storefront Settings JSON", "Active", "Featured", "New Arrival",
  "Brand", "Fabric Material", "Length", "Width", "Wash Care", "Show Colors", "Show Sizes",
  "Show Meters", "Show Specifications", "Show Fabric Material", "Show Length", "Show Width",
  "Show Wash Care", "Allow COD", "Free Shipping", "Allow Enquiry", "SEO Title", "SEO Description",
] as const;

export function normalizeProductImportHeader(value: string) {
  const key = value.trim().toLowerCase().replace(/[\s_-]+(.)/g, (_match, next: string) => next.toUpperCase());
  const aliases: Record<string, string> = {
    productId: "productId",
    productName: "name",
    longDescription: "description",
    originalPrice: "compareAtPrice",
    fixedLengthOptionsJson: "meterOptionsJson",
    universalVariantsJson: "variantsJson",
    storefrontSettingsJson: "storefrontSettingsJson",
  };
  return aliases[key] ?? key;
}
