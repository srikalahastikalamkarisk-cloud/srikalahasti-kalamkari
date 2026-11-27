import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { validOrigin } from "@/lib/admin/origin";
import { productInput } from "@/lib/admin/product-input";
import { recordInventoryMovement, setProductInventory } from "@/lib/admin/inventory";
import { synchronizeAvailability } from "@/lib/admin/inventory-policy";
import { parseCsvRows } from "@/lib/admin/csv-import";
import { streamImportCsv } from "@/lib/admin/large-csv-reader";
import { openLargePhotoZip } from "@/lib/admin/large-zip-reader";
import {
  withStagedImport,
  UploadError
} from "@/lib/admin/import-upload-storage";
import { fetchProductImage, isStoredProductImage, readStoredProductImage, saveProductImage, validatePhotoNumbers, validateProductImageCount } from "@/lib/admin/secure-image-import";
import { extractPhotoZip, MAX_ZIP_BYTES, MissingZipPhotosError } from "@/lib/admin/photo-zip";
import { registerProductImages } from "@/lib/admin/register-media";
import { assertManagedMediaAvailable, queueReleasedMedia } from "@/lib/admin/global-media-references";
import { normalizeProductImportHeader } from "@/lib/admin/product-import-columns";
import { importSlugBase as slugBase, normalizeImportLabel, nonEmptyImportColumns, resolveImportMatch, uniqueImportSlug } from "@/lib/admin/product-import-rules";
import { z } from "zod";
import sharp from "sharp";
import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { createImportImageCache } from "@/lib/admin/import-image-cache";

const MAX_REMOTE_IMAGE_BYTES = 500 * 1024 * 1024;
const PREVIEW_MAX_BYTES = 8 * 1024 * 1024;

function createRemoteImageBudget(
  fetchImage = fetchProductImage
) {
  let downloadedBytes = 0;

  return async function download(url: string) {
    if (downloadedBytes >= MAX_REMOTE_IMAGE_BYTES) {
      throw new Error(
        "Total image URL download limit of 500 MB reached"
      );
    }

    const image = await fetchImage(url);

    downloadedBytes += image.bytes.byteLength;

    if (downloadedBytes > MAX_REMOTE_IMAGE_BYTES) {
      throw new Error(
        "Total image URL downloads exceed 500 MB"
      );
    }

    return image;
  };
}
const PREVIEW_MAX_IMAGE_BYTES = 12 * 1024;

async function createImportThumbnail(bytes: Uint8Array) {
  for (const size of [240, 160, 96]) {
    const thumbnail = await sharp(Buffer.from(bytes), {
      limitInputPixels: 40000000
    })
      .rotate()
      .resize(size, size, {
        fit: "inside",
        withoutEnlargement: true
      })
      .webp({ quality: 55 })
      .toBuffer();

    if (thumbnail.length <= PREVIEW_MAX_IMAGE_BYTES) {
      return `data:image/webp;base64,${thumbnail.toString("base64")}`;
    }
  }

  return "";
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_ROWS = 1000;
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
  if (variant.isActive && (variant.price == null || variant.price <= 0)) {
    ctx.addIssue({ code: "custom", path: ["price"], message: "Every active variant needs a selling price greater than zero" });
  }
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

async function uniqueCategorySlug(tx: Prisma.TransactionClient, name: string) {
  const existing = await tx.category.findMany({ where: { slug: { startsWith: slugBase(name) } }, select: { slug: true } });
  return uniqueImportSlug(name, existing.map(item => item.slug));
}

async function ensureImportCategory(tx: Prisma.TransactionClient, categoryName: string, subcategoryName: string) {
  const findCategory = async (name: string, parentId: string | null) => {
    const candidates = await tx.category.findMany({ where: { parentId }, select: { id: true, name: true, slug: true, isActive: true } });
    const found = candidates.filter(item => item.id === name || item.slug === name || normalizeImportLabel(item.name) === normalizeImportLabel(name));
    if (found.length > 1) throw new Error(`Ambiguous category name: ${name}; use its ID or slug`);
    if (found[0] && !found[0].isActive) throw new Error(`Category is inactive: ${name}; activate it before importing`);
    return found[0] ?? null;
  };
  let parent = await findCategory(categoryName, null);
  if (!parent) parent = await tx.category.create({ data: { name: categoryName.trim(), slug: await uniqueCategorySlug(tx, categoryName), isActive: true } });
  if (!subcategoryName) return parent.id;
  let child = await findCategory(subcategoryName, parent.id);
  if (!child) child = await tx.category.create({ data: { name: subcategoryName.trim(), slug: await uniqueCategorySlug(tx, `${categoryName}-${subcategoryName}`), parentId: parent.id, isActive: true } });
  return child.id;
}

export async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!validOrigin(req)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const length = Number(req.headers.get("content-length"));
  if (!Number.isFinite(length) || length < 1 || length > MAX_REQUEST_BYTES) {
    return NextResponse.json({ error: "Combined CSV and ZIP upload exceeds the 23 MB request limit" }, { status: 413 });
  }
  const form = await req.formData().catch(() => null);

  if (!form) {
    return NextResponse.json({
      error: "Invalid import request"
    }, { status: 400 });
  }

  const csvId = form.get("csvUploadId");
  const zipId = form.get("zipUploadId");

  if (csvId !== null) {
    if (
      typeof csvId !== "string" ||
      !/^[a-f0-9-]{36}$/.test(csvId) ||
      (zipId !== null &&
        (typeof zipId !== "string" ||
         !/^[a-f0-9-]{36}$/.test(zipId)))
    ) {
      return NextResponse.json({
        error: "Invalid staged upload ID"
      }, { status: 400 });
    }

    try {
      return await withStagedImport(
        admin.id,
        csvId,
        zipId,
        async (csvPath, zipPath) => {
          const previewPath = path.join(
            path.dirname(csvPath),
            "preview-confirm.json"
          );

          const mode = form.get("mode");

          if (mode !== "preview" && mode !== "confirm") {
            return NextResponse.json({
              error: "Invalid import mode"
            }, { status: 400 });
          }

          const fingerprint = createHash("sha256")
            .update(JSON.stringify({
              csvId,
              zipId,
              downloadImages:
                form.get("downloadImages") !== "false"
            }))
            .digest("hex");

          if (mode === "preview") {
            await rm(previewPath, { force: true });

            const response = await processImport(
              form, csvPath, zipPath
            );

            if (!response.ok) return response;

            const result = await response.clone().json();

            if (!result.success || !Array.isArray(result.preview)) {
              return response;
            }

            const token = randomUUID();
            const temporary = `${previewPath}.${token}`;

            try {
              await writeFile(
                temporary,
                JSON.stringify({
                  token,
                  fingerprint,
                  createdAt: Date.now(),
                  readyRows: result.preview.map(
                    (item: { row: number }) => item.row
                  ),
                  skippedRows:
                    (result.skippedImageRows ?? []).map(
                      (item: { row: number }) => item.row
                    )
                }),
                { flag: "wx", mode: 0o600 }
              );

              await rename(temporary, previewPath);
            } finally {
              await rm(temporary, { force: true });
            }

            return NextResponse.json({
              ...result,
              previewToken: token
            });
          }

          const saved = await readFile(
            previewPath, "utf8"
          ).then(value => JSON.parse(value))
           .catch(() => null);

          if (
            !saved ||
            saved.token !== form.get("previewToken") ||
            saved.fingerprint !== fingerprint ||
            Date.now() - saved.createdAt >
              60 * 60 * 1000
          ) {
            return NextResponse.json({
              error: "Preview expired or files changed. Preview again before importing."
            }, { status: 409 });
          }

          if (
            Boolean(saved.skippedRows.length) !==
            (form.get("allowPartialImages") === "true")
          ) {
            return NextResponse.json({
              error: "Review excluded rows before confirming the import."
            }, { status: 409 });
          }

          // Consume authorization before any product writes.
          // A failed or interrupted confirmation needs a fresh preview.
          await rm(previewPath, { force: true });

          return processImport(
            form,
            csvPath,
            zipPath,
            {
              readyRows: saved.readyRows,
              skippedRows: saved.skippedRows
            }
          );
        }
      );
    } catch (error) {
      if (error instanceof UploadError) {
        return NextResponse.json({
          error: error.message
        }, { status: error.status });
      }

      console.error("Staged import failed", error);

      return NextResponse.json({
        error: "Unable to process staged import"
      }, { status: 500 });
    }
  }

  if (form.get("mode") !== "preview") {
    return NextResponse.json({
      error: "Use the staged import workflow to preview and confirm products."
    }, { status: 409 });
  }

  return processImport(form, null, null);
}

async function processImport(
  form: FormData,
  csvPath: string | null,
  zipPath: string | null,
  approvedPreview?: {
    readyRows: number[];
    skippedRows: number[];
  }
) {
  const file = form.get("file");
  if (!csvPath && (!(file instanceof File) || !file.name.toLowerCase().endsWith(".csv") || file.size > MAX_BYTES)) {
    return NextResponse.json({ error: "Choose a CSV file up to 2 MB" }, { status: 400 });
  }

  const mode = form?.get("mode") === "preview" ? "preview" : "confirm";
  const zip = csvPath ? null : form.get("zip");
  const hasZip = Boolean(zipPath || zip);
  if (zip !== null && (!(zip instanceof File) || !zip.name.toLowerCase().endsWith(".zip") || zip.size < 1 || zip.size > MAX_ZIP_BYTES)) {
    return NextResponse.json({ error: "ZIP must be a valid .zip file up to 20 MB" }, { status: 413 });
  }
  const downloadImages = form?.get("downloadImages") !== "false";
  const cachedImage = csvPath
    ? await createImportImageCache(csvPath)
    : fetchProductImage;

  const fetchBudgetedImage =
    createRemoteImageBudget(cachedImage);

  let rows: string[][];
  try {
    if (csvPath) {
      rows = [];
      let retainedChars = 0;

      for await (const row of streamImportCsv(csvPath)) {
        retainedChars += row.reduce(
          (sum, cell) => sum + cell.length,
          0
        );

        if (retainedChars > 32 * 1024 * 1024) {
          throw new Error(
            "CSV parsed content exceeds the safe processing budget"
          );
        }

        rows.push(row);
      }
    } else {
      if (!(file instanceof File)) {
        throw new Error("CSV file missing");
      }

      rows = parseCsvRows(await file.text());
    }
  }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid CSV" }, { status: 400 }); }
  if (rows.length < 2) return NextResponse.json({ error: "CSV must include a header and at least one product" }, { status: 400 });
  if (rows.length - 1 > MAX_ROWS) return NextResponse.json({ error: `Import is limited to ${MAX_ROWS} products per batch` }, { status: 413 });

  const headers = rows[0].map(normalizeProductImportHeader);
  // Update files may contain only Product ID/SKU plus the fields being changed.
  // Row-level validation below still enforces the fields needed for new products.
  if (!headers.some(key => ["productId", "sku", "slug", "name", "category", "price"].includes(key))) {
    return NextResponse.json({ error: "Include Product ID, SKU, Slug, or product details to import" }, { status: 400 });
  }
  const indexes = new Map(headers.map((key, index) => [key, index]));
  const errors: Array<{ row: number; error: string }> = [];
  const input: Array<{ row: number; data: ReturnType<typeof productInput.parse>; categoryName: string; categoryPath: { category: string; subcategory: string }; imageUrls: string[]; photoNumbers: string[]; variants: z.infer<typeof importedVariant>[]; existingId: string | null; supplied: Set<string>; storefront: z.infer<typeof storefrontSettingsSchema>; existingImageCount: number }> = [];
  const matchedRows = new Map<string, number>();
  const categoriesCatalog = await prisma.category.findMany({ select: { id: true, name: true, slug: true, parentId: true, isActive: true } });

  for (const [offset, cells] of rows.slice(1).entries()) {
    const get = (key: string) => cells[indexes.get(key) ?? -1]?.trim() ?? "";
    const identifierCandidates = await Promise.all([
      get("productId") ? prisma.product.findUnique({ where: { id: get("productId") } }) : null,
      get("sku") ? prisma.product.findUnique({ where: { sku: get("sku") } }) : null,
      (get("slug") || get("name")) ? prisma.product.findUnique({ where: { slug: get("slug") || slugBase(get("name")) } }) : null,
    ]);
    const match = resolveImportMatch(identifierCandidates);
    if (match.conflict) { errors.push({ row: offset + 2, error: "Product ID, SKU, and slug identify different products" }); continue; }
    const existingProduct = match.product;
    if (existingProduct && matchedRows.has(existingProduct.id)) { errors.push({ row: offset + 2, error: `Duplicate CSV row; product is already identified on row ${matchedRows.get(existingProduct.id)}` }); continue; }
    if (existingProduct) matchedRows.set(existingProduct.id, offset + 2);
    if (get("productId") && !existingProduct) { errors.push({ row: offset + 2, error: `Product ID was not found: ${get("productId")}` }); continue; }
    if (get("productId") && existingProduct && existingProduct.id !== get("productId")) { errors.push({ row: offset + 2, error: "Product ID conflicts with the supplied SKU or slug" }); continue; }
    if (!existingProduct && !get("name")) { errors.push({ row: offset + 2, error: "Name is required for a new product" }); continue; }
    const supplied = nonEmptyImportColumns(headers, cells);
    const old = (key: string) => existingProduct ? String((existingProduct as Record<string, unknown>)[key] ?? "") : "";
    const effective = (key: string, oldKey = key) => get(key) || (existingProduct ? old(oldKey) : "");
    let categoryToken = get("category");
    let subcategoryToken = get("subcategory");
    if (existingProduct && !categoryToken) {
      const currentCategory = await prisma.category.findUnique({ where: { id: existingProduct.categoryId }, include: { parent: true } });
      if (currentCategory) {
        categoryToken = currentCategory.parent?.name ?? currentCategory.name;
        subcategoryToken = currentCategory.parent ? currentCategory.name : "";
      }
    }
    // Category matching is normalized so exported IDs/slugs and human names
    // consistently reuse existing records. Missing categories are staged here;
    // they are only created during confirmation, inside the product transaction.
    const normalize = normalizeImportLabel;
    const allCategories = categoryToken ? categoriesCatalog : [];
    const requestedCategoryName = categoryToken;
    if (!requestedCategoryName) { errors.push({ row: offset + 2, error: "Category is required for a new product" }); continue; }
    const mainMatches = allCategories.filter(value => value.id === requestedCategoryName || value.slug === requestedCategoryName || normalize(value.name) === normalize(requestedCategoryName));
    if (mainMatches.length > 1) { errors.push({ row: offset + 2, error: `Ambiguous category: ${requestedCategoryName}; use its ID or slug` }); continue; }
    const mainCategory = mainMatches[0];
    if (mainCategory?.parentId) { errors.push({ row: offset + 2, error: `Category must identify a top-level category: ${requestedCategoryName}` }); continue; }
    if (mainCategory && !mainCategory.isActive && get("category")) { errors.push({ row: offset + 2, error: `Category is inactive: ${requestedCategoryName}; activate it before importing` }); continue; }
    let category = mainCategory ?? { id: `pending-category:${normalize(requestedCategoryName)}`, name: requestedCategoryName, slug: "", parentId: null, isActive: true };
    let categoryName = category.name;
    if (subcategoryToken) {
      const subcategoryName = subcategoryToken;
      const subMatches = allCategories.filter(value => value.parentId === category.id && (value.id === subcategoryName || value.slug === subcategoryName || normalize(value.name) === normalize(subcategoryName)));
      if (subMatches.length > 1) { errors.push({ row: offset + 2, error: `Ambiguous subcategory: ${subcategoryName}; use its ID or slug` }); continue; }
      const subcategory = subMatches[0];
      if (subcategory && !subcategory.isActive && get("subcategory")) { errors.push({ row: offset + 2, error: `Subcategory is inactive: ${subcategoryName}; activate it before importing` }); continue; }
      const resolvedParent = category;
      const resolvedSubcategory = subcategory ?? { id: `pending-subcategory:${normalize(subcategoryName)}`, name: subcategoryName, slug: "", parentId: resolvedParent.id, isActive: true };
      category = resolvedSubcategory;
      categoryName = `${resolvedParent.name} / ${resolvedSubcategory.name}`;
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
      colors = jsonCell(get("colorsJson"), "Colors JSON", existingProduct?.colors ?? undefined);
      sizes = jsonCell(get("sizesJson"), "Sizes JSON", existingProduct?.sizes ?? undefined);
      meterOptions = jsonCell(get("meterOptionsJson"), "Fixed length options JSON", existingProduct?.meterOptions ?? undefined);
      specifications = jsonCell(get("specificationsJson"), "Specifications JSON", existingProduct?.specifications ?? undefined);
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
    const requestedName = effective("name");
    const parsed = productInput.safeParse({
      name: requestedName, slug: effective("slug") || slugBase(requestedName), categoryId: category.id,
      // The schema requires a decimal price. The temporary positive value is
      // only for shared validation; we persist zero and inactive for drafts.
      price: Number(effective("price") || "1"), originalPrice: get("compareAtPrice") ? Number(get("compareAtPrice")) : existingProduct?.originalPrice == null ? null : Number(existingProduct.originalPrice),
      stock: Number(effective("stock") || "0"), sku: effective("sku") || null,
      description: effective("description") || null, shortDescription: effective("shortDescription") || null,
      brand: effective("brand") || null, fabricMaterial: effective("fabricMaterial") || null,
      length: effective("length") || null, width: effective("width") || null, washCare: effective("washCare") || null,
      availabilityStatus: effective("availabilityStatus") || "IN_STOCK",
      pricingMode: effective("pricingMode") || (existingProduct?.pricingMode ?? "FIXED"),
      pricePerMeter: effective("pricePerMeter") ? Number(effective("pricePerMeter")) : (existingProduct?.pricePerMeter == null ? null : Number(existingProduct.pricePerMeter)),
      colors, sizes, meterOptions, specifications,
      isActive: existingProduct ? (get("active") ? parseBool("active") : existingProduct.isActive) : get("price") ? parseBool("active", true) : false, isFeatured: get("featured") ? parseBool("featured") : Boolean(existingProduct?.isFeatured), isNewArrival: get("newArrival") ? parseBool("newArrival") : Boolean(existingProduct?.isNewArrival),
      showColors: parseBool("showColors", Boolean(storefront.showColors) || Boolean(colors)), showSizes: parseBool("showSizes", Boolean(storefront.showSizes) || Boolean(sizes)), showMeters: parseBool("showMeters", Boolean(storefront.showMeters) || Boolean(meterOptions)),
      showSpecifications: parseBool("showSpecifications", Boolean(storefront.showSpecifications)), showFabricMaterial: parseBool("showFabricMaterial", Boolean(storefront.showFabricMaterial)),
      showLength: parseBool("showLength", typeof storefront.showLength === "boolean" ? storefront.showLength : Boolean(get("length"))), showWidth: parseBool("showWidth", typeof storefront.showWidth === "boolean" ? storefront.showWidth : Boolean(get("width"))), showWashCare: parseBool("showWashCare", typeof storefront.showWashCare === "boolean" ? storefront.showWashCare : Boolean(get("washCare"))),
      allowCOD: parseBool("allowCOD", Boolean(storefront.allowCOD)), freeShipping: parseBool("freeShipping", Boolean(storefront.freeShipping)), allowEnquiry: parseBool("allowEnquiry", typeof storefront.allowEnquiry === "boolean" ? storefront.allowEnquiry : true),
      seoTitle: get("seoTitle") || null, seoDescription: get("seoDescription") || null,
    });
    if (!parsed.success) { errors.push({ row: offset + 2, error: parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; ") }); continue; }
    if (!get("price") && !existingProduct) { parsed.data.price = 0; parsed.data.isActive = false; }
    if (parsed.data.pricingMode === "LENGTH_OPTIONS" && (get("pricingMode") || get("variantsJson") || !existingProduct) && variants.some(variant => variant.lengthMeters == null)) {
      errors.push({ row: offset + 2, error: "Every LENGTH_OPTIONS variant requires lengthMeters in Variants JSON" }); continue;
    }
    const repeated = input.find(item => item.data.slug === parsed.data.slug || (parsed.data.sku && item.data.sku?.toLocaleLowerCase() === parsed.data.sku.toLocaleLowerCase()));
    if (repeated) { errors.push({ row: offset + 2, error: `Duplicate CSV product identifier; it already appears on row ${repeated.row}` }); continue; }
    input.push({ row: offset + 2, data: parsed.data, categoryName, categoryPath: { category: requestedCategoryName, subcategory: subcategoryToken }, imageUrls: rawImages, photoNumbers, variants, existingId: existingProduct?.id ?? null, supplied, storefront, existingImageCount: Array.isArray(existingProduct?.images) ? existingProduct.images.length : 0 });
  }
  if (errors.length) return NextResponse.json({ error: "Import validation failed; no products were created", errors }, { status: 422 });

  let zipPhotos = new Map<string, ReturnType<typeof extractPhotoZip> extends Map<string, infer T> ? T : never>();

  const largeZip = zipPath
    ? await openLargePhotoZip(zipPath)
    : null;

  const photoExists = (number: string) =>
    largeZip
      ? largeZip.has(number)
      : zipPhotos.has(number);

  async function readPhoto(number: string) {
    if (largeZip) return largeZip.read(number);

    const image = zipPhotos.get(number);

    if (!image) {
      throw new Error(`Missing ZIP image: ${number}`);
    }

    return image;
  }

  try {
  const skippedImageRows: Array<{
    row: number;
    error: string;
  }> = [];

  const allowPartialImages =
    form?.get("allowPartialImages") === "true";

  const requestedPhotoNumbers =
    input.flatMap(item => item.photoNumbers);
  if (hasZip && new Set(
    requestedPhotoNumbers.map(
      number => number.replace(/^0+(?=\d)/, "")
    )
  ).size !== requestedPhotoNumbers.length) return NextResponse.json({ error: "ZIP photo numbers must not be assigned to multiple products", errors: input.filter(item => item.photoNumbers.length).map(item => ({ row: item.row, error: "Photo number is repeated across products; each ZIP image must map to one product" })) }, { status: 422 });
  if (zip && requestedPhotoNumbers.length) {
    try { zipPhotos = extractPhotoZip(new Uint8Array(await zip.arrayBuffer()), requestedPhotoNumbers, true); }
    catch (error) {
      if (error instanceof MissingZipPhotosError) {
        const missing = new Set(error.numbers);

        return NextResponse.json({
          error: `ZIP is missing ${missing.size} requested image(s).`,
          errors: input.flatMap(item =>
            item.photoNumbers
              .filter(number => missing.has(number))
              .map(number => ({
                row: item.row,
                error: `Missing ZIP image for photo number ${number}`
              }))
          )
        }, { status: 422 });
      }

      const message = error instanceof Error ? error.message : "Invalid ZIP";
      const number = message.match(/(?:photo number |ZIP photo number: )([0-9]+)/i)?.[1];
      const affected = number ? input.filter(item => item.photoNumbers.includes(number)) : [];
      const rowErrors = affected.length
        ? affected.map(item => ({ row: item.row, error: message }))
        : [{ row: 0, error: message }];
      return NextResponse.json({ error: "ZIP validation failed", errors: rowErrors }, { status: 422 });
    }
  }
  if (!hasZip) {
    for (let index = input.length - 1; index >= 0; index--) {
      const item = input[index];

      if (!item.photoNumbers.length) continue;

      skippedImageRows.push({
        row: item.row,
        error: "Photo numbers supplied without a ZIP archive. Product row excluded."
      });

      input.splice(index, 1);
    }

    skippedImageRows.sort((a, b) => a.row - b.row);
  }

  if (hasZip) {
    for (let index = input.length - 1; index >= 0; index--) {
      const item = input[index];

      const missing = item.photoNumbers.filter(
        number => !photoExists(number)
      );

      if (!missing.length) continue;

      skippedImageRows.push({
        row: item.row,
        error: `Missing ZIP images: ${missing.join(", ")}. Product row excluded.`
      });

      input.splice(index, 1);
    }

    skippedImageRows.sort((a, b) => a.row - b.row);
  }

  if (skippedImageRows.length && !input.length) {
    return NextResponse.json({
      error: "No products have complete image matches.",
      errors: skippedImageRows
    }, { status: 422 });
  }

  if (
    mode === "confirm" &&
    skippedImageRows.length &&
    !allowPartialImages
  ) {
    return NextResponse.json({
      error: "Review missing image rows before importing ready products.",
      errors: skippedImageRows
    }, { status: 422 });
  }

  if (mode === "preview") {
    let previewBytesUsed = 0;

    async function boundedThumbnail(bytes: Uint8Array) {
      const preview = await createImportThumbnail(bytes);

      if (
        previewBytesUsed + preview.length >
        PREVIEW_MAX_BYTES
      ) {
        return "";
      }

      previewBytesUsed += preview.length;
      return preview;
    }

    const photoPreview: Array<{
      row: number; name: string; sku: string | null; category: string; pricingMode: string; action: "Create" | "Update"; imageStatus: string;
      price: number; stock: number; photoNumbers: string[]; imageCount: number;
      warnings: string[];
      validationStatus: "Ready"; images: Array<{ number: string; filename: string; mime: string; preview: string; external?: boolean }>; urlCount: number;
    }> = [];
    for (const item of input) {
      const images: Array<{
        number: string;
        filename: string;
        mime: string;
        preview: string;
        external?: boolean;
      }> = [];

      try {
        for (const number of item.photoNumbers.filter(
          number => photoExists(number)
        )) {
          const image = await readPhoto(number);

          images.push({
            number,
            filename: image.filename,
            mime: "image/webp",
            preview: await boundedThumbnail(image.bytes)
          });
        }
      } catch (error) {
        return NextResponse.json({
          error: "ZIP image preview failed",
          errors: [{
            row: item.row,
            error: error instanceof Error
              ? error.message
              : "Invalid ZIP image"
          }]
        }, { status: 422 });
      }
      try {
        for (const [index, url] of item.imageUrls.entries()) {
          if (!downloadImages && !isStoredProductImage(url)) {
            images.push({ number: `URL ${index + 1}`, filename: `External image URL ${index + 1}`, mime: "", preview: "", external: true });
            continue;
          }
          const image = isStoredProductImage(url) ? await readStoredProductImage(url) : await fetchBudgetedImage(url);
          images.push({
            number: `URL ${index + 1}`,
            filename: `Image URL ${index + 1}`,
            mime: "image/webp",
            preview: await boundedThumbnail(image.bytes)
          });

        }
      } catch (error) {
        return NextResponse.json({ error: "Image preview failed; no products were created", errors: [{ row: item.row, error: error instanceof Error ? error.message : "Image URL download failed" }] }, { status: 422 });
      }
      photoPreview.push({
        row: item.row, name: item.data.name, sku: item.data.sku ?? null, action: item.existingId ? "Update" : "Create",
        category: item.categoryName, pricingMode: item.data.pricingMode,
      price: item.data.price, stock: item.variants.length
          ? item.variants.filter(variant => variant.isActive).reduce((total, variant) => total + variant.stock, 0)
          : item.data.stock,
        photoNumbers: item.photoNumbers, imageCount: images.length || item.existingImageCount,
        imageStatus: images.length ? `${images.length} replacement image${images.length === 1 ? "" : "s"} mapped` : item.existingId && item.existingImageCount ? `${item.existingImageCount} existing image${item.existingImageCount === 1 ? "" : "s"} preserved` : "No images",
        warnings: [
          ...(item.photoNumbers.length && !hasZip
            ? ["Photo numbers listed; no ZIP was supplied, so these images will be skipped."]
            : []),
          ...(images.some(image => !image.external && !image.preview)
            ? ["Some thumbnails are omitted to keep the preview lightweight. Image mappings are retained."]
            : [])
        ],
        validationStatus: "Ready", images, urlCount: item.imageUrls.length,
      });
    }

    const categoriesForPreview = await prisma.category.findMany({ select: { id: true, name: true, slug: true, parentId: true } });
    const newCategoryKeys = new Set<string>();
    const newSubcategoryKeys = new Set<string>();
    for (const item of input) {
      const parent = categoriesForPreview.find(value => !value.parentId && (value.slug === item.categoryPath.category || normalizeImportLabel(value.name) === normalizeImportLabel(item.categoryPath.category)));
      if (!parent) newCategoryKeys.add(normalizeImportLabel(item.categoryPath.category));
      if (item.categoryPath.subcategory) {
        const child = parent && categoriesForPreview.find(value => value.parentId === parent.id && (value.slug === item.categoryPath.subcategory || normalizeImportLabel(value.name) === normalizeImportLabel(item.categoryPath.subcategory)));
        if (!child) newSubcategoryKeys.add(`${normalizeImportLabel(item.categoryPath.category)}:${normalizeImportLabel(item.categoryPath.subcategory)}`);
      }
    }
    return NextResponse.json({ success: true, totalRows: rows.length - 1, newProducts: input.filter(item => !item.existingId).length, updates: input.filter(item => item.existingId).length, newCategories: newCategoryKeys.size, newSubcategories: newSubcategoryKeys.size, preview: photoPreview,
      skippedImageRows
    });
  }

  if (approvedPreview) {
    const readyRows = input.map(item => item.row);
    const skippedRows = skippedImageRows.map(
      item => item.row
    );

    if (
      JSON.stringify(readyRows) !==
        JSON.stringify(approvedPreview.readyRows) ||
      JSON.stringify(skippedRows) !==
        JSON.stringify(approvedPreview.skippedRows)
    ) {
      return NextResponse.json({
        error: "Product readiness changed. Preview again before importing."
      }, { status: 409 });
    }
  }

  // Download every image before writing any products. A download failure is reported by CSV row and the import can be retried.
  const downloaded = new Map<number, string[]>();
  for (const item of input) {
    try {
      const paths: string[] = [];
      for (const number of item.photoNumbers.filter(value => photoExists(value))) {
        const image = await readPhoto(number);
        const extension = image.filename.toLowerCase().endsWith(".jpeg") ? "jpg" : image.filename.split(".").pop()!.toLowerCase() as "jpg" | "png" | "webp";
        paths.push(await saveProductImage(image.bytes, extension));
      }
      for (const url of item.imageUrls) {
        if (isStoredProductImage(url) || !downloadImages) paths.push(url);
        else {
          const image = await fetchBudgetedImage(url);

          paths.push(
            await saveProductImage(
              image.bytes,
              image.extension
            )
          );
        }
      }
      downloaded.set(item.row, paths);
    } catch (error) {
      errors.push({ row: item.row, error: `${error instanceof Error ? error.message : "Image download failed"}. Correct the URL or storage configuration, then retry this row.` });
    }
  }
  if (errors.length) return NextResponse.json({ error: "Image preparation failed; no products were created", errors }, { status: 422 });

  const outcomes: Array<{ row: number; slug: string; status: string }> = [];
  let updated = 0;
  for (let start = 0; start < input.length; start += 25) {
    for (const item of input.slice(start, start + 25)) {
      const data = item.data;
      try {
        if (item.existingId) {
          const categoryWasSupplied = item.supplied.has("category") || item.supplied.has("subcategory");
          await prisma.$transaction(async tx => {
            const before = await tx.product.findUniqueOrThrow({ where: { id: item.existingId! }, select: { images: true, specifications: true } });
            const replacementImages = downloaded.get(item.row) ?? [];
            await assertManagedMediaAvailable(tx, [replacementImages, data.specifications]);
            const patch: Record<string, unknown> = {};
            const fields: Array<[string, keyof typeof data]> = [
              ["name", "name"], ["slug", "slug"], ["description", "description"], ["shortDescription", "shortDescription"],
              ["price", "price"], ["compareAtPrice", "originalPrice"], ["pricingMode", "pricingMode"], ["pricePerMeter", "pricePerMeter"],
              ["sku", "sku"], ["brand", "brand"], ["fabricMaterial", "fabricMaterial"], ["length", "length"], ["width", "width"], ["washCare", "washCare"],
              ["active", "isActive"], ["featured", "isFeatured"], ["newArrival", "isNewArrival"],
              ["colorsJson", "colors"], ["sizesJson", "sizes"], ["meterOptionsJson", "meterOptions"], ["specificationsJson", "specifications"],
              ["showColors", "showColors"], ["showSizes", "showSizes"], ["showMeters", "showMeters"], ["showSpecifications", "showSpecifications"],
              ["showFabricMaterial", "showFabricMaterial"], ["showLength", "showLength"], ["showWidth", "showWidth"], ["showWashCare", "showWashCare"],
              ["allowCOD", "allowCOD"], ["freeShipping", "freeShipping"], ["allowEnquiry", "allowEnquiry"], ["seoTitle", "seoTitle"], ["seoDescription", "seoDescription"],
            ];
            for (const [column, field] of fields) if (item.supplied.has(column)) patch[field] = data[field];
            if (item.supplied.has("storefrontSettingsJson")) {
              for (const field of ["showColors", "showSizes", "showMeters", "showSpecifications", "showFabricMaterial", "showLength", "showWidth", "showWashCare", "allowCOD", "freeShipping", "allowEnquiry"] as const) {
                if (typeof item.storefront[field] === "boolean") patch[field] = item.storefront[field];
              }
            }
            if (item.supplied.has("length") && !item.supplied.has("showLength") && !item.supplied.has("storefrontSettingsJson")) patch.showLength = true;
            if (item.supplied.has("width") && !item.supplied.has("showWidth") && !item.supplied.has("storefrontSettingsJson")) patch.showWidth = true;
            if (categoryWasSupplied) patch.categoryId = await ensureImportCategory(tx, item.categoryPath.category, item.categoryPath.subcategory);
            if (item.supplied.has("imageUrls") || item.supplied.has("mainImage") || item.supplied.has("additionalImages") || item.supplied.has("photoNumbers")) {
              const images = downloaded.get(item.row) ?? [];
              if (images.length) patch.images = images as Prisma.InputJsonValue;
            }
            await tx.product.update({ where: { id: item.existingId! }, data: patch as Prisma.ProductUpdateInput });
            if (item.supplied.has("stock")) {
              if (await tx.productVariant.count({ where: { productId: item.existingId! } })) throw new Error("This product has variants; update stock through the validated variant inventory workflow");
              await setProductInventory(tx, { productId: item.existingId!, stock: data.stock, availabilityStatus: item.supplied.has("availabilityStatus") ? data.availabilityStatus : undefined, note: "Stock adjustment from CSV import", performedBy: (await getCurrentAdmin())?.email });
            } else if (item.supplied.has("availabilityStatus")) {
              await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM Product WHERE id = ${item.existingId!} FOR UPDATE`;
              const current = await tx.product.findUniqueOrThrow({ where: { id: item.existingId! }, select: { stock: true } });
              await setProductInventory(tx, { productId: item.existingId!, stock: current.stock, availabilityStatus: data.availabilityStatus, note: "Availability status from CSV import", performedBy: (await getCurrentAdmin())?.email });
            }
            if (item.supplied.has("imageUrls") || item.supplied.has("mainImage") || item.supplied.has("additionalImages") || item.supplied.has("photoNumbers")) {
              const images = downloaded.get(item.row) ?? [];
              if (images.length) await registerProductImages(tx, item.existingId!, images, item.photoNumbers.filter(value => photoExists(value)));
            }
            const after = await tx.product.findUniqueOrThrow({ where: { id: item.existingId! }, select: { images: true, specifications: true } });
            await queueReleasedMedia(tx, before, after);
          });
          outcomes.push({ row: item.row, slug: data.slug, status: "updated" });
          updated++;
          continue;
        }
        const initialAvailabilityStatus = synchronizeAvailability(data.stock, "IN_STOCK", data.availabilityStatus);
        await prisma.$transaction(async tx => {
          await assertManagedMediaAvailable(tx, [downloaded.get(item.row), data.specifications, item.variants.map(variant => variant.imageUrl)]);
          const categoryId = await ensureImportCategory(tx, item.categoryPath.category, item.categoryPath.subcategory);
          const productSlugs = (await tx.product.findMany({ where: { slug: { startsWith: slugBase(data.slug) } }, select: { slug: true } })).map(value => value.slug);
          const slug = uniqueImportSlug(data.slug, productSlugs);
          const created = await tx.product.create({ data: {
            name: data.name, slug, categoryId,
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
          await registerProductImages(tx, created.id, productImages, item.photoNumbers.filter(value => photoExists(value)));
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
        const safeMessage = error instanceof Error && error.message.startsWith("This product has variants;") ? error.message : null;
        errors.push({ row: item.row, error: code === "P2002" ? "Product slug or SKU already exists" : safeMessage ?? "Product could not be saved" });
      }
    }
  }
  const created = outcomes.length - updated;
  return NextResponse.json({ success: errors.length === 0, created, updated,
    skipped: skippedImageRows.length,
    failed: errors.length,
    outcomes,
    errors,
    skippedImageRows }, { status: errors.length ? 207 : 201 });
  } finally {
    if (largeZip) await largeZip.close();
  }
}
