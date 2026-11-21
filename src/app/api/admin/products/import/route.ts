import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { validOrigin } from "@/lib/admin/origin";
import { productInput } from "@/lib/admin/product-input";
import { recordInventoryMovement } from "@/lib/admin/inventory";
import { synchronizeAvailability } from "@/lib/admin/inventory-policy";
import { parseCsvRows } from "@/lib/admin/csv-import";
import { downloadProductImage, fetchProductImage, isStoredProductImage, readStoredProductImage, saveProductImage, validatePhotoNumbers, validateProductImageCount } from "@/lib/admin/secure-image-import";
import { extractPhotoZip, MAX_ZIP_BYTES } from "@/lib/admin/photo-zip";
import { registerProductImages } from "@/lib/admin/register-media";
import { normalizeProductImportHeader } from "@/lib/admin/product-import-columns";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_ROWS = 500;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_BYTES + MAX_ZIP_BYTES + 1024 * 1024;
const importedVariant = z.object({
  sku: z.string().trim().max(191).nullable().optional(),
  colorName: z.string().trim().max(100).nullable().optional(),
  colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  size: z.string().trim().max(50).nullable().optional(),
  lengthMeters: z.number().positive().finite().nullable().optional(),
  attributes: z.record(z.string().trim().min(1).max(100), z.string().trim().min(1).max(191)).nullable().optional(),
  imageUrl: z.string().trim().max(500).url().nullable().optional(),
  price: z.number().positive().finite().nullable().optional(),
  originalPrice: z.number().positive().finite().nullable().optional(),
  stock: z.number().int().min(0).max(10000000).default(0),
  isActive: z.boolean().default(true),
}).strict().superRefine((variant, ctx) => {
  if (variant.price != null && variant.originalPrice != null && variant.originalPrice <= variant.price) {
    ctx.addIssue({ code: "custom", path: ["originalPrice"], message: "Original price must exceed selling price" });
  }
});
const storefrontSettingsSchema = z.object({
  showColors: z.boolean().optional(), showSizes: z.boolean().optional(), showMeters: z.boolean().optional(),
  showSpecifications: z.boolean().optional(), showFabricMaterial: z.boolean().optional(), showLength: z.boolean().optional(),
  showWidth: z.boolean().optional(), showWashCare: z.boolean().optional(), allowCOD: z.boolean().optional(),
  freeShipping: z.boolean().optional(), allowEnquiry: z.boolean().optional(),
}).strict();

function jsonCell<T>(value: string, label: string, fallback: T): T {
  if (!value.trim()) return fallback;
  try { return JSON.parse(value) as T; }
  catch { throw new Error(`${label} must contain valid JSON`); }
}

export async function POST(req: NextRequest) {
  if (!await getCurrentAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!validOrigin(req)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const length = Number(req.headers.get("content-length"));
  if (!Number.isFinite(length) || length < 1 || length > MAX_REQUEST_BYTES) {
    return NextResponse.json({ error: "Combined CSV and ZIP upload exceeds the 23 MB request limit" }, { status: 413 });
  }
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".csv") || file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Choose a CSV file up to 2 MB" }, { status: 400 });
  }

  const mode = form?.get("mode") === "preview" ? "preview" : "confirm";
  const zip = form?.get("zip");
  if (zip !== null && (!(zip instanceof File) || !zip.name.toLowerCase().endsWith(".zip") || zip.size < 1 || zip.size > MAX_ZIP_BYTES)) {
    return NextResponse.json({ error: "ZIP must be a valid .zip file up to 20 MB" }, { status: 413 });
  }
  const downloadImages = form?.get("downloadImages") !== "false";

  let rows: string[][];
  try { rows = parseCsvRows(await file.text()); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid CSV" }, { status: 400 }); }
  if (rows.length < 2) return NextResponse.json({ error: "CSV must include a header and at least one product" }, { status: 400 });
  if (rows.length - 1 > MAX_ROWS) return NextResponse.json({ error: `Import is limited to ${MAX_ROWS} products per batch` }, { status: 413 });

  const headers = rows[0].map(normalizeProductImportHeader);
  const required = ["name", "slug", "category", "price", "stock"];
  const missing = required.filter(key => !headers.includes(key));
  if (missing.length) return NextResponse.json({ error: `Missing columns: ${missing.join(", ")}` }, { status: 400 });
  const indexes = new Map(headers.map((key, index) => [key, index]));
  const errors: Array<{ row: number; error: string }> = [];
  const input: Array<{ row: number; data: ReturnType<typeof productInput.parse>; categoryName: string; imageUrls: string[]; photoNumbers: string[]; variants: z.infer<typeof importedVariant>[] }> = [];

  for (const [offset, cells] of rows.slice(1).entries()) {
    const get = (key: string) => cells[indexes.get(key) ?? -1]?.trim() ?? "";
    const mainCategory = await prisma.category.findFirst({
      where: { isActive: true, OR: [{ id: get("category") }, { slug: get("category") }, { name: get("category") }] },
      select: { id: true, name: true },
    });
    if (!mainCategory) { errors.push({ row: offset + 2, error: `Active category not found: ${get("category")}` }); continue; }
    let category = mainCategory;
    let categoryName = mainCategory.name;
    if (get("subcategory")) {
      const subcategory = await prisma.category.findFirst({
        where: { isActive: true, parentId: mainCategory.id, OR: [{ id: get("subcategory") }, { slug: get("subcategory") }, { name: get("subcategory") }] },
        select: { id: true, name: true },
      });
      if (!subcategory) { errors.push({ row: offset + 2, error: `Active subcategory not found under ${mainCategory.name}: ${get("subcategory")}` }); continue; }
      category = subcategory;
      categoryName = `${mainCategory.name} / ${subcategory.name}`;
    }
    const imageUrlsCell = get("imageUrls");
    const rawImages = (imageUrlsCell
      ? imageUrlsCell.split(",")
      : [get("mainImage"), ...get("additionalImages").split(",")])
      .map(v => v.trim()).filter(Boolean);
    const parseBool = (key: string, fallback = false) => get(key) ? get(key).toLowerCase() === "true" || get(key) === "1" : fallback;
    let photoNumbers: string[];
    let colors: unknown, sizes: unknown, meterOptions: unknown, specifications: unknown, variants: z.infer<typeof importedVariant>[];
    let storefront: z.infer<typeof storefrontSettingsSchema>;
    try {
      photoNumbers = validatePhotoNumbers(get("photoNumbers"));
      validateProductImageCount(rawImages.length, photoNumbers.length);
      if (new Set(rawImages).size !== rawImages.length) throw new Error("Image URLs contain duplicates");
      for (const imageUrl of rawImages) {
        if (isStoredProductImage(imageUrl)) continue;
        const parsedUrl = new URL(imageUrl);
        if (parsedUrl.protocol !== "https:" || parsedUrl.username || parsedUrl.password) throw new Error("Image URLs must be public HTTPS URLs or valid stored product image paths");
      }
      colors = jsonCell(get("colorsJson"), "Colors JSON", undefined);
      sizes = jsonCell(get("sizesJson"), "Sizes JSON", undefined);
      meterOptions = jsonCell(get("meterOptionsJson"), "Fixed length options JSON", undefined);
      specifications = jsonCell(get("specificationsJson"), "Specifications JSON", undefined);
      const parsedStorefront = storefrontSettingsSchema.safeParse(jsonCell<unknown>(get("storefrontSettingsJson"), "Storefront Settings JSON", {}));
      if (!parsedStorefront.success) throw new Error(`Storefront Settings JSON: ${parsedStorefront.error.issues.map(issue => issue.message).join("; ")}`);
      storefront = parsedStorefront.data;
      const rawVariants = jsonCell<unknown>(get("variantsJson"), "Variants JSON", []);
      const parsedVariants = z.array(importedVariant).max(200).safeParse(rawVariants);
      if (!parsedVariants.success) throw new Error(`Variants JSON: ${parsedVariants.error.issues.map(issue => issue.message).join("; ")}`);
      variants = parsedVariants.data;
      const variantSkus = variants.map(variant => variant.sku?.trim().toLowerCase()).filter(Boolean);
      if (new Set(variantSkus).size !== variantSkus.length) throw new Error("Variants JSON contains duplicate SKUs");
      const variantCombinations = variants.map(variant => {
        const attributes = variant.attributes && Object.keys(variant.attributes).length
          ? variant.attributes
          : {
              ...(variant.colorName ? { Color: variant.colorName } : {}),
              ...(variant.size ? { Size: variant.size } : {}),
              ...(variant.lengthMeters != null ? { Length: `${variant.lengthMeters}m` } : {}),
            };
        return JSON.stringify(Object.entries(attributes).map(([name, value]) => [name.trim().toLowerCase(), value.trim().toLowerCase()]).sort(([a], [b]) => a.localeCompare(b)));
      });
      if (new Set(variantCombinations).size !== variantCombinations.length) throw new Error("Variants JSON contains duplicate attribute combinations");
    } catch (error) { errors.push({ row: offset + 2, error: error instanceof Error ? error.message : "Invalid image fields" }); continue; }
    const parsed = productInput.safeParse({
      name: get("name"), slug: get("slug"), categoryId: category.id,
      price: Number(get("price")), originalPrice: get("compareAtPrice") ? Number(get("compareAtPrice")) : null,
      stock: Number(get("stock")), sku: get("sku") || null,
      description: get("description") || null, shortDescription: get("shortDescription") || null,
      brand: get("brand") || null, fabricMaterial: get("fabricMaterial") || null,
      length: get("length") || null, width: get("width") || null, washCare: get("washCare") || null,
      availabilityStatus: get("availabilityStatus") || "IN_STOCK",
      pricingMode: get("pricingMode") || "FIXED",
      pricePerMeter: get("pricePerMeter") ? Number(get("pricePerMeter")) : null,
      colors, sizes, meterOptions, specifications,
      isActive: parseBool("active", true), isFeatured: parseBool("featured"), isNewArrival: parseBool("newArrival"),
      showColors: parseBool("showColors", Boolean(storefront.showColors)), showSizes: parseBool("showSizes", Boolean(storefront.showSizes)), showMeters: parseBool("showMeters", Boolean(storefront.showMeters)),
      showSpecifications: parseBool("showSpecifications", Boolean(storefront.showSpecifications)), showFabricMaterial: parseBool("showFabricMaterial", Boolean(storefront.showFabricMaterial)),
      showLength: parseBool("showLength", Boolean(storefront.showLength)), showWidth: parseBool("showWidth", Boolean(storefront.showWidth)), showWashCare: parseBool("showWashCare", Boolean(storefront.showWashCare)),
      allowCOD: parseBool("allowCOD", Boolean(storefront.allowCOD)), freeShipping: parseBool("freeShipping", Boolean(storefront.freeShipping)), allowEnquiry: parseBool("allowEnquiry", typeof storefront.allowEnquiry === "boolean" ? storefront.allowEnquiry : true),
      seoTitle: get("seoTitle") || null, seoDescription: get("seoDescription") || null,
    });
    if (!parsed.success) { errors.push({ row: offset + 2, error: parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; ") }); continue; }
    if (parsed.data.pricingMode === "LENGTH_OPTIONS" && variants.some(variant => variant.lengthMeters == null)) {
      errors.push({ row: offset + 2, error: "Every LENGTH_OPTIONS variant requires lengthMeters in Variants JSON" }); continue;
    }
    input.push({ row: offset + 2, data: parsed.data, categoryName, imageUrls: rawImages, photoNumbers, variants });
  }
  if (errors.length) return NextResponse.json({ error: "Import validation failed; no products were created", errors }, { status: 422 });

  let zipPhotos = new Map<string, ReturnType<typeof extractPhotoZip> extends Map<string, infer T> ? T : never>();
  const requestedPhotoNumbers = input.flatMap(item => item.photoNumbers);
  if (new Set(requestedPhotoNumbers).size !== requestedPhotoNumbers.length) return NextResponse.json({ error: "ZIP photo numbers must not be assigned to multiple products", errors: input.filter(item => item.photoNumbers.length).map(item => ({ row: item.row, error: "Photo number is repeated across products; each ZIP image must map to one product" })) }, { status: 422 });
  if (requestedPhotoNumbers.length && !zip) return NextResponse.json({ error: "CSV has Photo Numbers but no ZIP was uploaded", errors: input.filter(item => item.photoNumbers.length).map(item => ({ row: item.row, error: "Upload a ZIP containing the listed photo numbers" })) }, { status: 422 });
  if (zip && requestedPhotoNumbers.length) {
    try { zipPhotos = extractPhotoZip(new Uint8Array(await zip.arrayBuffer()), requestedPhotoNumbers); }
    catch (error) {
      const message = error instanceof Error ? error.message : "Invalid ZIP";
      const number = message.match(/(?:photo number |ZIP photo number: )([0-9]+)/i)?.[1];
      const affected = number ? input.filter(item => item.photoNumbers.includes(number)) : [];
      const rowErrors = affected.length
        ? affected.map(item => ({ row: item.row, error: message }))
        : [{ row: 0, error: message }];
      return NextResponse.json({ error: "ZIP validation failed", errors: rowErrors }, { status: 422 });
    }
  }
  if (mode === "preview") {
    const photoPreview: Array<{
      row: number; name: string; sku: string | null; category: string; pricingMode: string;
      price: number; stock: number; photoNumbers: string[]; imageCount: number;
      validationStatus: "Ready"; images: Array<{ number: string; filename: string; mime: string; preview: string; external?: boolean }>; urlCount: number;
    }> = [];
    for (const item of input) {
      const images: Array<{ number: string; filename: string; mime: string; preview: string; external?: boolean }> = item.photoNumbers.map(number => {
        const image = zipPhotos.get(number)!;
        return { number, filename: image.filename, mime: image.mime, preview: `data:${image.mime};base64,${image.bytes.toString("base64")}` };
      });
      try {
        for (const [index, url] of item.imageUrls.entries()) {
          if (!downloadImages && !isStoredProductImage(url)) {
            images.push({ number: `URL ${index + 1}`, filename: `External image URL ${index + 1}`, mime: "", preview: "", external: true });
            continue;
          }
          const image = isStoredProductImage(url) ? await readStoredProductImage(url) : await fetchProductImage(url);
          images.push({ number: `URL ${index + 1}`, filename: `Image URL ${index + 1}`, mime: image.mime, preview: `data:${image.mime};base64,${Buffer.from(image.bytes).toString("base64")}` });
          const currentBytes = photoPreview.reduce((sum, row) => sum + row.images.reduce((sub, entry) => sub + entry.preview.length, 0), 0) + images.reduce((sum, entry) => sum + entry.preview.length, 0);
          if (currentBytes > 8 * 1024 * 1024) return NextResponse.json({ error: "Preview images exceed 8 MB; reduce image sizes before preview" }, { status: 413 });
        }
      } catch (error) {
        return NextResponse.json({ error: "Image preview failed; no products were created", errors: [{ row: item.row, error: error instanceof Error ? error.message : "Image URL download failed" }] }, { status: 422 });
      }
      photoPreview.push({
        row: item.row, name: item.data.name, sku: item.data.sku ?? null,
        category: item.categoryName, pricingMode: item.data.pricingMode,
        price: item.data.price, stock: item.variants.length
          ? item.variants.filter(variant => variant.isActive).reduce((total, variant) => total + variant.stock, 0)
          : item.data.stock,
        photoNumbers: item.photoNumbers, imageCount: images.length,
        validationStatus: "Ready", images, urlCount: item.imageUrls.length,
      });
    }
    const previewBytes = photoPreview.reduce((sum, product) => sum + product.images.reduce((sub, image) => sub + image.preview.length, 0), 0);
    if (previewBytes > 8 * 1024 * 1024) return NextResponse.json({ error: "Preview images exceed 8 MB; reduce ZIP images before preview" }, { status: 413 });
    return NextResponse.json({ success: true, preview: photoPreview });
  }

  // Download every image before writing any products. A download failure is reported by CSV row and the import can be retried.
  const downloaded = new Map<number, string[]>();
  for (const item of input) {
    try {
      const paths: string[] = [];
      for (const number of item.photoNumbers) {
        const image = zipPhotos.get(number)!;
        const extension = image.filename.toLowerCase().endsWith(".jpeg") ? "jpg" : image.filename.split(".").pop()!.toLowerCase() as "jpg" | "png" | "webp";
        paths.push(await saveProductImage(image.bytes, extension));
      }
      for (const url of item.imageUrls) {
        if (isStoredProductImage(url) || !downloadImages) paths.push(url);
        else paths.push(await downloadProductImage(url));
      }
      downloaded.set(item.row, paths);
    } catch (error) {
      errors.push({ row: item.row, error: `${error instanceof Error ? error.message : "Image download failed"}. Correct the URL or storage configuration, then retry this row.` });
    }
  }
  if (errors.length) return NextResponse.json({ error: "Image preparation failed; no products were created", errors }, { status: 422 });

  const outcomes: Array<{ row: number; slug: string; status: string }> = [];
  for (let start = 0; start < input.length; start += 25) {
    for (const item of input.slice(start, start + 25)) {
      const data = item.data;
      try {
        const existing = await prisma.product.findFirst({ where: { OR: [{ slug: data.slug }, ...(data.sku ? [{ sku: data.sku }] : [])] }, select: { id: true } });
        if (existing) { errors.push({ row: item.row, error: "Product slug or SKU already exists; create-only import skipped" }); continue; }
        const initialAvailabilityStatus = synchronizeAvailability(data.stock, "IN_STOCK", data.availabilityStatus);
        await prisma.$transaction(async tx => {
          const created = await tx.product.create({ data: {
            name: data.name, slug: data.slug, categoryId: data.categoryId,
            price: data.price, originalPrice: data.originalPrice, stock: data.stock,
            availabilityStatus: initialAvailabilityStatus, sku: data.sku, description: data.description,
            shortDescription: data.shortDescription, brand: data.brand,
            fabricMaterial: data.fabricMaterial, length: data.length, width: data.width,
            washCare: data.washCare, isActive: data.isActive, isFeatured: data.isFeatured,
            isNewArrival: data.isNewArrival, seoTitle: data.seoTitle,
            seoDescription: data.seoDescription,
            pricingMode: data.pricingMode, pricePerMeter: data.pricePerMeter,
            showColors: data.showColors, showSizes: data.showSizes, showMeters: data.showMeters,
            showSpecifications: data.showSpecifications, showFabricMaterial: data.showFabricMaterial,
            showLength: data.showLength, showWidth: data.showWidth, showWashCare: data.showWashCare,
            allowCOD: data.allowCOD, freeShipping: data.freeShipping, allowEnquiry: data.allowEnquiry,
            colors: data.colors ? data.colors as Prisma.InputJsonValue : Prisma.JsonNull,
            sizes: data.sizes ? data.sizes as Prisma.InputJsonValue : Prisma.JsonNull,
            meterOptions: data.meterOptions ? data.meterOptions as Prisma.InputJsonValue : Prisma.JsonNull,
            specifications: data.specifications ? data.specifications as Prisma.InputJsonValue : Prisma.JsonNull,
            images: downloaded.get(item.row)?.length
              ? downloaded.get(item.row) as Prisma.InputJsonValue
              : Prisma.JsonNull,
          } });
          const productImages = downloaded.get(item.row) ?? [];
          await registerProductImages(tx, created.id, productImages, item.photoNumbers);
          if (item.variants.length) {
            await tx.productVariant.createMany({ data: item.variants.map((variant, sortOrder) => ({
              productId: created.id, sku: variant.sku || null, colorName: variant.colorName || null,
              colorHex: variant.colorHex || null, size: variant.size || null,
              lengthMeters: variant.lengthMeters ?? null,
              attributes: variant.attributes ? variant.attributes as Prisma.InputJsonValue : Prisma.JsonNull,
              imageUrl: variant.imageUrl || null, price: variant.price ?? null,
              originalPrice: variant.originalPrice ?? null, stock: variant.stock,
              isActive: variant.isActive, sortOrder,
            })) });
          }
          const activeVariantStock = item.variants.filter(variant => variant.isActive).reduce((total, variant) => total + variant.stock, 0);
          const finalStock = item.variants.length ? activeVariantStock : data.stock;
          const availabilityStatus = synchronizeAvailability(finalStock, "IN_STOCK", data.availabilityStatus);
          await tx.product.update({ where: { id: created.id }, data: { stock: finalStock, availabilityStatus } });
          if (finalStock > 0) await recordInventoryMovement(tx, {
            productId: created.id, productName: created.name, productSku: created.sku,
            movementType: "INITIAL_STOCK", quantityChange: finalStock,
            quantityBefore: 0, quantityAfter: finalStock,
            note: "Opening inventory at CSV import",
            performedBy: (await getCurrentAdmin())?.email,
          });
        });
        outcomes.push({ row: item.row, slug: data.slug, status: "created" });
      } catch (error) {
        const code = typeof error === "object" && error && "code" in error ? error.code : undefined;
        errors.push({ row: item.row, error: code === "P2002" ? "Product slug or SKU already exists" : "Product could not be created" });
      }
    }
  }
  const skipped = errors.filter(item => item.error.includes("already exists") || item.error.includes("create-only import skipped")).length;
  return NextResponse.json({ success: errors.length === 0, created: outcomes.length, skipped, failed: errors.length - skipped, outcomes, errors }, { status: errors.length ? 207 : 201 });
}
