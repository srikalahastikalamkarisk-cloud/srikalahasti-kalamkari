"use client";

import "./products-manager.css";
import ProductImageGallery from "./product-image-gallery";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, LoaderCircle, Plus, Trash2 } from "lucide-react";

type Category = {
  id: string;
  name: string;
  parentId: string | null;
};

type FormData = {
  name: string;
  slug: string;
  images: string[];
  categoryId: string;
  sku: string;
  description: string;
  shortDescription: string;
  price: string;
  originalPrice: string;
  pricingMode: "FIXED" | "PER_METER" | "LENGTH_OPTIONS";
  pricePerMeter: string;
  stock: string;
  availabilityStatus: "IN_STOCK" | "OUT_OF_STOCK" | "COMING_SOON";
  brand: string;
  fabricMaterial: string;
  length: string;
  width: string;
  showFabricMaterial: boolean;
  showLength: boolean;
  showWidth: boolean;
  washCare: string;
  isActive: boolean;
  isFeatured: boolean;
  isNewArrival: boolean;
  allowCOD: boolean;
  freeShipping: boolean;
  allowEnquiry: boolean;
  showColors: boolean;
  showSizes: boolean;
  colors: { name: string; hex: string }[];
  sizes: string[];
  meterOptions: {
    meters: string;
    price: string;
    originalPrice: string;
    stock: string;
  }[];
};

type VariantRow = {
  id?: string;
  attributes: Record<string, string>;
  colorHex?: string;
  sku: string;
  price: string;
  originalPrice: string;
  stock: string;
  isActive: boolean;
};
type CustomAttribute = { name: string; values: string[]; draft: string };

const initial: FormData = {
  name: "",
  slug: "",
  images: [],
  categoryId: "",
  sku: "",
  description: "",
  shortDescription: "",
  price: "",
  originalPrice: "",
  pricingMode: "FIXED",
  pricePerMeter: "",
  stock: "0",
  availabilityStatus: "IN_STOCK",
  brand: "Srikalahasti Kalamkari",
  fabricMaterial: "",
  length: "",
  width: "",
  showFabricMaterial: false,
  showLength: false,
  showWidth: false,
  washCare: "",
  isActive: true,
  isFeatured: false,
  isNewArrival: false,
  allowCOD: false,
  freeShipping: false,
  allowEnquiry: true,
  showColors: false,
  showSizes: false,
  colors: [],
  sizes: [],
  meterOptions: [],
};

function slugify(value: string) {
  return value.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function AddProductForm({
  productId,
}: {
  productId?: string;
} = {}) {
  const router = useRouter();
  const [form, setForm] = useState<FormData>(initial);
  const [productLoading, setProductLoading] = useState(Boolean(productId));
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [imagesUploading, setImagesUploading] = useState(false);
  const [error, setError] = useState("");
  const [categoryLoading, setCategoryLoading] = useState(true);
  const [sizeDraft, setSizeDraft] = useState("");
  const [variantsEnabled, setVariantsEnabled] = useState(false);
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [variantsDirty, setVariantsDirty] = useState(false);
  const [lengthsEnabled, setLengthsEnabled] = useState(false);
  const [lengthValues, setLengthValues] = useState<string[]>([]);
  const [lengthDraft, setLengthDraft] = useState("");
  const [customAttributes, setCustomAttributes] = useState<CustomAttribute[]>([]);
  const [createdProductId, setCreatedProductId] = useState<string | null>(null);
  const [variantNotice, setVariantNotice] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/admin/categories", {
          credentials: "same-origin",
          cache: "no-store",
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Unable to load categories");
        }

        if (!cancelled) setCategories(data.categories ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Category loading failed");
        }
      } finally {
        if (!cancelled) setCategoryLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, []);


  useEffect(() => {
    if (!productId) return;

    let cancelled = false;

    async function loadProduct() {
      setProductLoading(true);

      try {
        const response = await fetch(
          `/api/admin/products/${encodeURIComponent(productId!)}`,
          { credentials: "same-origin", cache: "no-store" }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Unable to load product");
        }

        const p = data.product;

        if (!cancelled) {
          const stringValue = (value: unknown) =>
            value == null ? "" : String(value);

          const loadedVariants: VariantRow[] = (Array.isArray(p.variants) ? p.variants : [])
            .map((variant: Record<string, unknown>) => {
              const attributes = variant.attributes && typeof variant.attributes === "object" && !Array.isArray(variant.attributes)
                ? variant.attributes as Record<string, string>
                : Object.fromEntries([
                    ...(variant.colorName ? [["Color", String(variant.colorName)]] : []),
                    ...(variant.size ? [["Size", String(variant.size)]] : []),
                    ...(variant.lengthMeters != null ? [["Length", `${Number(variant.lengthMeters)}m`]] : []),
                  ]);
              return { id: String(variant.id), attributes, colorHex: stringValue(variant.colorHex) || undefined, sku: stringValue(variant.sku), price: stringValue(variant.price), originalPrice: stringValue(variant.originalPrice), stock: stringValue(variant.stock ?? 0), isActive: Boolean(variant.isActive) };
            });
          const names = [...new Set(loadedVariants.flatMap(variant => Object.keys(variant.attributes)))];
          const storedColors = Array.isArray(p.colors) ? p.colors.flatMap((color: unknown) => {
            if (typeof color === "string") return [{ name: color, hex: "#000000" }];
            if (color && typeof color === "object" && "name" in color && typeof color.name === "string") return [{ name: color.name, hex: "hex" in color && typeof color.hex === "string" ? color.hex : "#000000" }];
            return [];
          }) : [];
          const mergedColors = [...storedColors];
          for (const variant of loadedVariants) {
            const name = Object.entries(variant.attributes).find(([key]) => key.toLowerCase() === "color")?.[1];
            if (name && !mergedColors.some(color => color.name.toLowerCase() === name.toLowerCase())) mergedColors.push({ name, hex: variant.colorHex || "#000000" });
          }
          const storedSizes = Array.isArray(p.sizes) ? p.sizes.filter((value: unknown): value is string => typeof value === "string") : [];
          const mergedSizes = [...storedSizes];
          for (const variant of loadedVariants) {
            const value = Object.entries(variant.attributes).find(([key]) => key.toLowerCase() === "size")?.[1];
            if (value && !mergedSizes.some(size => size.toLowerCase() === value.toLowerCase())) mergedSizes.push(value);
          }
          setVariants(loadedVariants);
          setVariantsEnabled(loadedVariants.length > 0 || (Boolean(p.showColors) && mergedColors.length > 0) || (Boolean(p.showSizes) && mergedSizes.length > 0) || p.pricingMode === "LENGTH_OPTIONS");
          setVariantsDirty(false);
          setLengthsEnabled(names.some(name => name.toLowerCase() === "length") || p.pricingMode === "LENGTH_OPTIONS");
          setLengthValues([...new Set([
            ...loadedVariants.flatMap(variant => Object.entries(variant.attributes).filter(([name]) => name.toLowerCase() === "length").map(([, value]) => value)),
            ...(Array.isArray(p.meterOptions) ? p.meterOptions.map((option: { meters?: unknown }) => option?.meters == null ? "" : `${Number(option.meters)}m`) : []),
          ].filter(Boolean))]);
          setCustomAttributes(names.filter(name => !["color", "size", "length"].includes(name.toLowerCase())).map(name => ({ name, values: [...new Set(loadedVariants.map(variant => variant.attributes[name]).filter(Boolean))], draft: "" })));

          setForm({
            ...initial,
            name: p.name || "",
            slug: p.slug || "",
            categoryId: p.categoryId || "",
            sku: p.sku || "",
            description: p.description || "",
            shortDescription: p.shortDescription || "",
            images: Array.isArray(p.images) ? p.images : [],
            price: stringValue(p.price),
            originalPrice: stringValue(p.originalPrice),
            pricingMode: p.pricingMode || "FIXED",
            pricePerMeter: stringValue(p.pricePerMeter),
            stock: stringValue(p.stock),
            availabilityStatus:
              p.availabilityStatus === "OUT_OF_STOCK" ||
              p.availabilityStatus === "COMING_SOON"
                ? p.availabilityStatus
                : "IN_STOCK",
            brand: p.brand || "",
            fabricMaterial: p.fabricMaterial || "",
            length: p.length || "",
            width: p.width || "",
            showFabricMaterial: Boolean(p.showFabricMaterial),
            showLength: Boolean(p.showLength),
            showWidth: Boolean(p.showWidth),
            washCare: p.washCare || "",
            isActive: Boolean(p.isActive),
            isFeatured: Boolean(p.isFeatured),
            isNewArrival: Boolean(p.isNewArrival),
            allowCOD: Boolean(p.allowCOD),
            freeShipping: Boolean(p.freeShipping),
            allowEnquiry: Boolean(p.allowEnquiry),
            showColors: Boolean(p.showColors),
            showSizes: Boolean(p.showSizes),
            colors: mergedColors,
            sizes: mergedSizes,
            meterOptions: Array.isArray(p.meterOptions)
              ? p.meterOptions.map((option: {
                  meters: number;
                  price: number;
                  originalPrice?: number | null;
                  stock: number;
                }) => ({
                  meters: stringValue(option.meters),
                  price: stringValue(option.price),
                  originalPrice: stringValue(option.originalPrice),
                  stock: stringValue(option.stock),
                }))
              : [],
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Unable to load product"
          );
        }
      } finally {
        if (!cancelled) setProductLoading(false);
      }
    }

    void loadProduct();

    return () => {
      cancelled = true;
    };
  }, [productId]);

  function update<K extends keyof FormData>(
    key: K,
    value: FormData[K]
  ) {
    setForm(current => ({ ...current, [key]: value }));
  }

  function addColor() {
    setVariantsEnabled(true);
    setVariantsDirty(true);
    setVariantNotice("Unsaved variation changes. Generate combinations or save to apply them.");
    setForm(current => ({
      ...current,
      colors: [...current.colors, { name: "", hex: "#000000" }],
    }));
  }

  function updateColor(index: number, key: "name" | "hex", value: string) {
    setVariantsDirty(true);
    setVariantNotice("Unsaved variation changes. Generate combinations or save to apply them.");
    setForm(current => ({
      ...current,
      colors: current.colors.map((color, i) =>
        i === index ? { ...color, [key]: value } : color
      ),
    }));
  }

  function removeColor(index: number) {
    setVariantsDirty(true);
    setVariantNotice("Unsaved variation changes. Removed colors will no longer be offered after saving.");
    setForm(current => ({
      ...current,
      colors: current.colors.filter((_, i) => i !== index),
    }));
  }

  function addSize(value: string) {
    const normalized = value.trim();
    if (!normalized) return;

    setVariantsEnabled(true);
    setVariantsDirty(true);
    setVariantNotice("Unsaved variation changes. Generate combinations or save to apply them.");
    setForm(current => {
      if (current.sizes.some(
        size => size.toLowerCase() === normalized.toLowerCase()
      )) return current;

      return { ...current, sizes: [...current.sizes, normalized] };
    });
  }

  function addMeterOption() {
    setVariantsEnabled(true);
    setVariantsDirty(true);
    setVariantNotice("Unsaved length option changes. Generate combinations or save to apply them.");
    setForm(current => ({
      ...current,
      meterOptions: [
        ...current.meterOptions,
        { meters: "", price: "", originalPrice: "", stock: "0" },
      ],
    }));
  }

  function updateMeterOption(
    index: number,
    key: "meters" | "price" | "originalPrice" | "stock",
    value: string
  ) {
    setVariantsDirty(true);
    setVariantNotice("Unsaved length option changes. Generate combinations or save to apply them.");
    setForm(current => ({
      ...current,
      meterOptions: current.meterOptions.map((option, i) =>
        i === index ? { ...option, [key]: value } : option
      ),
    }));
  }

  function removeMeterOption(index: number) {
    setVariantsDirty(true);
    setVariantNotice("Unsaved length option changes. Removed combinations will be retired when saved.");
    setForm(current => ({
      ...current,
      meterOptions: current.meterOptions.filter((_, i) => i !== index),
    }));
  }

  function combinationKey(attributes: Record<string, string>) {
    return JSON.stringify(Object.entries(attributes)
      .map(([name, value]) => [name.trim().toLowerCase(), value.trim().toLowerCase()])
      .sort(([a], [b]) => String(a).localeCompare(String(b))));
  }

  function makeVariantCombinations() {
    const groups: Array<{ name: string; values: string[] }> = [];
    if (form.showColors) {
      const values = [...new Map(form.colors.map(color => color.name.trim()).filter(Boolean).map(value => [value.toLowerCase(), value])).values()];
      if (values.length) groups.push({ name: "Color", values });
    }
    if (form.showSizes) {
      const values = [...new Map(form.sizes.map(value => value.trim()).filter(Boolean).map(value => [value.toLowerCase(), value])).values()];
      if (values.length) groups.push({ name: "Size", values });
    }
    const configuredLengths = form.pricingMode === "LENGTH_OPTIONS"
      ? form.meterOptions.map(option => `${Number(option.meters)}m`).filter(value => value !== "NaNm")
      : lengthsEnabled ? lengthValues.map(value => value.trim()).filter(Boolean) : [];
    if (configuredLengths.length) groups.push({ name: "Length", values: [...new Set(configuredLengths)] });
    for (const group of customAttributes) {
      const name = group.name.trim();
      const values = [...new Map(group.values.map(value => value.trim()).filter(Boolean).map(value => [value.toLowerCase(), value])).values()];
      if (name && values.length) groups.push({ name, values });
    }

    const duplicateNames = groups.map(group => group.name.toLowerCase());
    if (new Set(duplicateNames).size !== duplicateNames.length) {
      throw new Error("Each variant attribute must have a unique name.");
    }
    if (variantsEnabled && customAttributes.some(group => group.name.trim() && group.values.length === 0)) throw new Error("Add at least one value or remove each empty custom attribute.");
    if (!variantsEnabled) return [];
    if (groups.length === 0) return [];

    const combinations = groups.reduce<Record<string, string>[]>(
      (rows, group) => rows.flatMap(row => group.values.map(value => ({ ...row, [group.name]: value }))),
      [{}]
    );
    if (combinations.length > 200) throw new Error("A product can have at most 200 variant combinations.");
    const existingFor = (attributes: Record<string, string>) => variants.find(variant => variant.isActive && combinationKey(variant.attributes) === combinationKey(attributes))
      || variants.find(variant => combinationKey(variant.attributes) === combinationKey(attributes));
    return combinations.map((attributes, combinationIndex) => {
      const prior = existingFor(attributes);
      const meterOption = form.pricingMode === "LENGTH_OPTIONS"
        ? form.meterOptions.find(option => `${Number(option.meters)}m` === attributes.Length)
        : undefined;
      const combinationsForLength = meterOption ? combinations.map((item, index) => ({ item, index })).filter(({ item }) => item.Length === attributes.Length) : [];
      const positionForLength = combinationsForLength.findIndex(({ index }) => index === combinationIndex);
      const baseStock = meterOption ? Number(meterOption.stock) : variants.length === 0 ? Number(form.stock) : 0;
      const stockDivisor = meterOption ? combinationsForLength.length : combinations.length;
      const stock = stockDivisor > 0
        ? String(Math.floor(baseStock / stockDivisor) + (combinationIndex === (meterOption ? combinationsForLength[positionForLength]?.index : 0) ? baseStock % stockDivisor : 0))
        : "0";
      if (prior) return form.pricingMode === "LENGTH_OPTIONS" && meterOption
        ? { ...prior, attributes, price: meterOption.price, originalPrice: meterOption.originalPrice, stock }
        : { ...prior, attributes };
      const color = attributes.Color ? form.colors.find(item => item.name.trim().toLowerCase() === attributes.Color.toLowerCase()) : undefined;
      return {
        attributes,
        colorHex: color?.hex,
        sku: "",
        price: meterOption ? meterOption.price : form.pricingMode === "PER_METER" ? form.pricePerMeter : form.price,
        originalPrice: meterOption ? meterOption.originalPrice : form.originalPrice,
        stock,
        isActive: true,
      } satisfies VariantRow;
    });
  }

  function generateVariantCombinations() {
    try {
      const generated = makeVariantCombinations();
      setVariants(generated);
      setVariantsDirty(true);
      setVariantNotice(`${generated.length} combination${generated.length === 1 ? "" : "s"} ready. Review price and stock before saving; retired combinations remain stored as inactive.`);
    } catch (err) {
      setVariantNotice(err instanceof Error ? err.message : "Unable to generate combinations.");
    }
  }

  function updateVariant(index: number, patch: Partial<VariantRow>) {
    setVariants(rows => rows.map((row, i) => i === index ? { ...row, ...patch } : row));
    setVariantsDirty(true);
    setVariantNotice("Unsaved variant changes");
  }

  function addLength(value: string) {
    const normalized = value.trim();
    if (!normalized || lengthValues.some(item => item.toLowerCase() === normalized.toLowerCase())) return;
    setLengthsEnabled(true);
    setVariantsEnabled(true);
    setVariantsDirty(true);
    setVariantNotice("Unsaved variation changes. Generate combinations or save to apply them.");
    setLengthValues(values => [...values, normalized]);
    setLengthDraft("");
  }

  function updateAttributeGroup(index: number, patch: Partial<CustomAttribute>) {
    setVariantsDirty(true);
    setVariantNotice("Unsaved variation changes. Generate combinations or save to apply them.");
    setCustomAttributes(groups => groups.map((group, i) => i === index ? { ...group, ...patch } : group));
  }

  function addAttributeValue(index: number) {
    const group = customAttributes[index];
    if (!group?.draft.trim()) return;
    setVariantsEnabled(true);
    updateAttributeGroup(index, { values: [...new Set([...group.values, group.draft.trim()])], draft: "" });
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (imagesUploading) {
      setError("Please wait until all product images finish uploading.");
      return;
    }
    setError("");

    if (!form.categoryId) {
      setError("Please select a category.");
      return;
    }

    setLoading(true);

    try {
      if (form.showColors && form.colors.some(color => !color.name.trim())) throw new Error("Enter a name for each color or remove the empty color row.");
      if (customAttributes.some(group => (!group.name.trim() && group.values.length > 0) || (group.name.trim() && group.values.length === 0))) throw new Error("Complete each custom attribute name and add at least one value, or remove the empty attribute.");
      const savedVariants = makeVariantCombinations();
      const activeVariants = savedVariants.filter(variant => variant.isActive);
      if (activeVariants.some(variant => !Number.isFinite(Number(variant.price)) || Number(variant.price) <= 0)) {
        throw new Error("Every available variant needs a selling price greater than zero.");
      }
      if (savedVariants.some(variant => !Number.isInteger(Number(variant.stock)) || Number(variant.stock) < 0)) {
        throw new Error("Variant stock must be a whole number of zero or more.");
      }
      const variantSkus = savedVariants.map(variant => variant.sku.trim().toLowerCase()).filter(Boolean);
      if (new Set(variantSkus).size !== variantSkus.length) throw new Error("Variant SKUs must be unique.");
      if (activeVariants.some(variant => variant.originalPrice && Number(variant.originalPrice) <= Number(variant.price))) {
        throw new Error("Variant original price must exceed its selling price.");
      }
      const payload = {
        ...form,
        price: Number(form.price),
        originalPrice: form.originalPrice
          ? Number(form.originalPrice) : null,
        pricePerMeter: form.pricingMode === "PER_METER"
          ? Number(form.pricePerMeter) : null,
        stock: Number(form.stock),
        sku: form.sku.trim() || null,
        brand: form.brand.trim() || null,
        fabricMaterial: form.fabricMaterial.trim() || null,
        length: form.length.trim() || null,
        width: form.width.trim() || null,
        washCare: form.washCare.trim() || null,
        description: form.description || null,
        shortDescription: form.shortDescription || null,
        colors: [...new Map(form.colors.filter(color => color.name.trim()).map(color => [color.name.trim().toLowerCase(), { ...color, name: color.name.trim() }])).values()],
        sizes: [...new Map(form.sizes.map(size => size.trim()).filter(Boolean).map(size => [size.toLowerCase(), size])).values()],
        meterOptions: form.pricingMode === "LENGTH_OPTIONS"
          ? form.meterOptions.map(option => ({
              label: `${option.meters} Meter${Number(option.meters) === 1 ? "" : "s"}`,
              meters: Number(option.meters),
              price: Number(option.price),
              originalPrice: option.originalPrice
                ? Number(option.originalPrice) : null,
              stock: Number(option.stock),
            }))
          : [],
        ...(form.pricingMode === "LENGTH_OPTIONS" && form.meterOptions[0]
          ? {
              price: Number(form.meterOptions[0].price),
              originalPrice: form.meterOptions[0].originalPrice
                ? Number(form.meterOptions[0].originalPrice) : null,
              stock: form.meterOptions.reduce(
                (total, option) => total + Number(option.stock), 0
              ),
            }
          : {}),
      };

      const activeProductId = productId || createdProductId;
      const shouldSaveVariants = variantsEnabled || variants.length > 0 || form.pricingMode === "LENGTH_OPTIONS";
      // Keep a product out of public listings while its parent fields and purchasable
      // variant rows are being saved by their separate APIs. If variant validation
      // fails, it stays inactive instead of exposing a partially updated catalog item.
      const pendingActivation = shouldSaveVariants && payload.isActive;
      const firstSavePayload = pendingActivation ? { ...payload, isActive: false } : payload;
      const response = await fetch(
        activeProductId
          ? `/api/admin/products/${encodeURIComponent(activeProductId)}`
          : "/api/admin/products",
        {
        method: activeProductId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(firstSavePayload),
      });

      const data = await response.json();

      if (!response.ok) {
        const fieldErrors = data.details?.fieldErrors;
        const firstError = fieldErrors
          ? Object.values(fieldErrors).flat().find(Boolean)
          : null;
        throw new Error(
          typeof firstError === "string"
            ? firstError
            : data.error || "Unable to save product"
        );
      }

      const savedProductId = activeProductId || data.product?.id;
      if (!savedProductId) throw new Error("Product saved, but its ID was not returned. Reopen it to finish variant setup.");
      if (!activeProductId) setCreatedProductId(savedProductId);
      if (shouldSaveVariants) {
        const variantResponse = await fetch(`/api/admin/products/${encodeURIComponent(savedProductId)}/variants`, {
          method: "PUT",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ variants: savedVariants.map((variant, sortOrder) => {
            const lengthValue = Object.entries(variant.attributes).find(([name]) => name.toLowerCase() === "length")?.[1];
            const meters = lengthValue?.match(/[0-9]+(?:\.[0-9]+)?/);
            const colorName = Object.entries(variant.attributes).find(([name]) => name.toLowerCase() === "color")?.[1];
            const size = Object.entries(variant.attributes).find(([name]) => name.toLowerCase() === "size")?.[1];
            const color = colorName ? form.colors.find(item => item.name.trim().toLowerCase() === colorName.toLowerCase()) : undefined;
            return {
              ...(variant.id ? { id: variant.id } : {}),
              attributes: variant.attributes,
              sku: variant.sku.trim() || null,
              colorName: colorName || null,
              colorHex: variant.colorHex || color?.hex || null,
              size: size || null,
              lengthMeters: meters ? Number(meters[0]) : null,
              price: variant.price ? Number(variant.price) : null,
              originalPrice: variant.originalPrice ? Number(variant.originalPrice) : null,
              stock: Number(variant.stock),
              isActive: variant.isActive,
              sortOrder,
            };
          }) }),
        });
        const variantData = await variantResponse.json();
        if (!variantResponse.ok) throw new Error(pendingActivation
          ? `Variant save failed and this product remains inactive. ${variantData.error || "Correct the variant details and save again to finish the product."}`
          : `Product details saved, but variant save failed: ${variantData.error || "Please correct variant details and save again."}`);
        const savedRows: VariantRow[] = (variantData.variants || []).map((row: Record<string, unknown>) => ({
          id: String(row.id),
          attributes: row.attributes && typeof row.attributes === "object" && !Array.isArray(row.attributes) ? row.attributes as Record<string,string> : Object.fromEntries([
            ...(row.colorName ? [["Color", String(row.colorName)]] : []),
            ...(row.size ? [["Size", String(row.size)]] : []),
            ...(row.lengthMeters != null ? [["Length", `${Number(row.lengthMeters)}m`]] : []),
          ]),
          colorHex: typeof row.colorHex === "string" ? row.colorHex : undefined,
          sku: String(row.sku || ""), price: row.price == null ? "" : String(row.price), originalPrice: row.originalPrice == null ? "" : String(row.originalPrice), stock: String(row.stock ?? 0), isActive: Boolean(row.isActive),
        }));
        setVariants(savedRows);
        setVariantsDirty(false);
        setVariantNotice("Product and variants saved.");
      }

      if (pendingActivation) {
        const activationResponse = await fetch(`/api/admin/products/${encodeURIComponent(savedProductId)}`, {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const activationData = await activationResponse.json();
        if (!activationResponse.ok) {
          throw new Error(`Product and variants were saved, but the product remains inactive because activation failed: ${activationData.error || "Try Save Changes again."}`);
        }
      }

      router.push(activeProductId ? "/admin/products" : `/admin/products/${encodeURIComponent(savedProductId)}/edit`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save product");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
    <div className="skpm-page">
      <div className="skpm-heading">
        <div>
          <span className="skpm-eyebrow">STORE CATALOGUE</span>
          <h1>{productId ? "Edit Product" : "Add New Product"}</h1>
          <p>{productId
              ? "Update your existing Kalamkari product."
              : "Create a product for your Kalamkari collection."}</p>
        </div>
        <Link href="/admin/products" className="skpm-add-btn">
          <ArrowLeft size={17} /> Back to Products
        </Link>
      </div>

      {error && (
        <div className="skpm-error" role="alert">{error}</div>
      )}

      {productLoading ? (
        <p>Loading product details...</p>
      ) : (
      <form onSubmit={submit} className="skpm-panel">
        <ProductImageGallery
          images={form.images}
          onChange={images => update("images", images)}
          onUploadingChange={setImagesUploading}
        />

        <div style={{padding:24}}>
          <h2>Basic Information</h2>

          <div className="skpm-form-grid">
            <label className="skpm-field">
              Product Name *
              <input required minLength={2} maxLength={191}
                value={form.name}
                onChange={e => {
                  const name = e.target.value;
                  setForm(current => ({
                    ...current,
                    name,
                    slug: slugify(name),
                  }));
                }}
                placeholder="Royal Kalamkari Saree" />
            </label>

            <label className="skpm-field">
              URL Slug *
              <input required minLength={2} maxLength={191}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                value={form.slug}
                onChange={e => update("slug", slugify(e.target.value))}
                placeholder="royal-kalamkari-saree" />
            </label>

            <label className="skpm-field">
              Category / Subcategory *
              <select required value={form.categoryId}
                disabled={categoryLoading}
                onChange={e => update("categoryId", e.target.value)}>
                <option value="">
                  {categoryLoading ? "Loading categories..." : "Select Category"}
                </option>
                {categories.filter(c => !c.parentId).map(parent => (
                  <optgroup key={parent.id} label={parent.name}>
                    <option value={parent.id}>{parent.name}</option>
                    {categories.filter(c => c.parentId === parent.id).map(child => (
                      <option key={child.id} value={child.id}>
                        ↳ {child.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            <label className="skpm-field">
              SKU
              <input maxLength={191} value={form.sku}
                onChange={e => update("sku", e.target.value)}
                placeholder="KT-SAR-001" />
            </label>

            <label className="skpm-field skpm-field-full">
              Short Description
              <textarea maxLength={2000} rows={2}
                value={form.shortDescription}
                onChange={e => update("shortDescription", e.target.value)}
                placeholder="Short product description..." />
            </label>

            <label className="skpm-field skpm-field-full">
              Full Description
              <textarea maxLength={10000} rows={4}
                value={form.description}
                onChange={e => update("description", e.target.value)}
                placeholder="Product details..." />
            </label>
          </div>
        </div>

        <div className="skpm-form-section">
          <h2>Pricing & Stock</h2>
          <div className="skpm-form-grid">
            <label className="skpm-field">
              Pricing Type *
              <select value={form.pricingMode}
                onChange={e => { const mode = e.target.value as FormData["pricingMode"]; update("pricingMode", mode); if (mode === "LENGTH_OPTIONS") setVariantsEnabled(true); setVariantsDirty(true); }}>
                <option value="FIXED">Fixed Price</option>
                <option value="PER_METER">Price Per Meter</option>
                <option value="LENGTH_OPTIONS">Fixed Length Options</option>
              </select>
            </label>

            {form.pricingMode !== "LENGTH_OPTIONS" && (
              <label className="skpm-field">
                Selling Price (₹) *
                <input required type="number" min="0.01" step="0.01"
                  value={form.price}
                  onChange={e => update("price", e.target.value)}
                  placeholder="1999" />
              </label>
            )}

            {form.pricingMode !== "LENGTH_OPTIONS" && (
              <label className="skpm-field">
                Original Price (₹)
                <input type="number" min="0.01" step="0.01"
                  value={form.originalPrice}
                  onChange={e => update("originalPrice", e.target.value)}
                  placeholder="2499" />
              </label>
            )}

            {form.pricingMode === "PER_METER" && (
              <label className="skpm-field">
                Price Per Meter (₹) *
                <input required type="number" min="0.01" step="0.01"
                  value={form.pricePerMeter}
                  onChange={e => update("pricePerMeter", e.target.value)}
                  placeholder="450" />
              </label>
            )}

            {form.pricingMode !== "LENGTH_OPTIONS" && (
              <label className="skpm-field">
                Available Stock *
                <input required type="number" min="0" step="1"
                  value={form.stock}
                  onChange={e => update("stock", e.target.value)} />
              </label>
            )}
          </div>
          {form.pricingMode === "LENGTH_OPTIONS" && (
            <div className="skpm-meter-options">
              <div className="skpm-meter-heading">
                <div>
                  <h3>Fixed Length Pricing</h3>
                  <p>Add different lengths with individual prices and stock.</p>
                </div>
                <button type="button" onClick={addMeterOption}>
                  <Plus size={15} /> Add Length
                </button>
              </div>

              {form.meterOptions.map((option, index) => {
                const original = Number(option.originalPrice);
                const selling = Number(option.price);
                const discount = original > selling && selling > 0
                  ? Math.round((original - selling) / original * 100)
                  : 0;

                return (
                  <div className="skpm-meter-card" key={index}>
                    <div className="skpm-meter-card-heading">
                      <strong>Length Option {index + 1}</strong>
                      <button
                        type="button"
                        className="skpm-meter-remove"
                        onClick={() => removeMeterOption(index)}
                        aria-label={`Remove length option ${index + 1}`}
                      >
                        <Trash2 size={15} /> Remove
                      </button>
                    </div>

                    <div className="skpm-form-grid">
                      <label className="skpm-field">
                        Length (Meters) *
                        <input
                          type="number"
                          required
                          min="0.01"
                          step="0.01"
                          value={option.meters}
                          onChange={e => updateMeterOption(
                            index, "meters", e.target.value
                          )}
                          placeholder="1"
                        />
                      </label>

                      <label className="skpm-field">
                        Selling Price (₹) *
                        <input
                          type="number"
                          required
                          min="0.01"
                          step="0.01"
                          value={option.price}
                          onChange={e => updateMeterOption(
                            index, "price", e.target.value
                          )}
                          placeholder="450"
                        />
                      </label>

                      <label className="skpm-field">
                        Original Price (₹)
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={option.originalPrice}
                          onChange={e => updateMeterOption(
                            index, "originalPrice", e.target.value
                          )}
                          placeholder="550"
                        />
                      </label>

                      <label className="skpm-field">
                        Available Stock *
                        <input
                          type="number"
                          required
                          min="0"
                          step="1"
                          value={option.stock}
                          onChange={e => updateMeterOption(
                            index, "stock", e.target.value
                          )}
                        />
                      </label>
                    </div>

                    {discount > 0 && (
                      <p className="skpm-meter-discount">
                        {discount}% discount
                      </p>
                    )}
                  </div>
                );
              })}

              {form.meterOptions.length === 0 && (
                <p className="skpm-form-note">
                  Add at least one length option before saving.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="skpm-form-section">
          <h2>Product Variations</h2>
          <p className="skpm-form-note">Configure options here. Generate combinations below, then Save Changes to update the product and its purchasable variants together.</p>

          <div className="skpm-optional-fields skpm-variation-section">
            <label className="skpm-field-toggle">
              <input
                type="checkbox"
                checked={form.showColors}
                onChange={e => { update("showColors", e.target.checked); if (e.target.checked && form.colors.some(color => color.name.trim())) setVariantsEnabled(true); setVariantsDirty(true); }}
              />
              <span>
                <strong>Enable Product Colors</strong>
                <small>Show available colors on the customer product page.</small>
              </span>
            </label>

            {form.showColors && (
              <div className="skpm-variation-content">
                {form.colors.map((color, index) => (
                  <div className="skpm-color-row" key={index}>
                    <input
                      aria-label={`Color ${index + 1} name`}
                      value={color.name}
                      maxLength={100}
                      placeholder="e.g. Royal Blue"
                      onChange={e => updateColor(index, "name", e.target.value)}
                    />
                    <input
                      aria-label={`Color ${index + 1} picker`}
                      type="color"
                      value={color.hex}
                      onChange={e => updateColor(index, "hex", e.target.value)}
                    />
                    <button
                      type="button"
                      className="skpm-remove-option"
                      aria-label="Remove color"
                      onClick={() => removeColor(index)}
                    >
                      <Trash2 size={16}/>
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  className="skpm-secondary-action"
                  onClick={addColor}
                >
                  <Plus size={15}/> Add Color
                </button>
              </div>
            )}
          </div>

          <div className="skpm-optional-fields skpm-variation-section">
            <label className="skpm-field-toggle">
              <input
                type="checkbox"
                checked={form.showSizes}
                onChange={e => { update("showSizes", e.target.checked); if (e.target.checked && form.sizes.length > 0) setVariantsEnabled(true); setVariantsDirty(true); }}
              />
              <span>
                <strong>Enable Size Preferences</strong>
                <small>Show selectable sizes on the customer product page.</small>
              </span>
            </label>

            {form.showSizes && (
              <div className="skpm-variation-content">
                <div className="skpm-size-presets">
                  {["S", "M", "L", "XL", "XXL", "Free Size"].map(size => (
                    <button
                      type="button"
                      key={size}
                      className={`skpm-size-chip ${
                        form.sizes.includes(size) ? "selected" : ""
                      }`}
                      onClick={() => addSize(size)}
                    >
                      {form.sizes.includes(size) ? "✓ " : "+ "}{size}
                    </button>
                  ))}
                </div>

                <div className="skpm-size-custom">
                  <input
                    value={sizeDraft}
                    maxLength={50}
                    placeholder="Enter custom size"
                    onChange={e => setSizeDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addSize(sizeDraft);
                        setSizeDraft("");
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="skpm-secondary-action"
                    onClick={() => {
                      addSize(sizeDraft);
                      setSizeDraft("");
                    }}
                  >
                    <Plus size={15}/> Add Size
                  </button>
                </div>

                {form.sizes.length > 0 && (
                  <div className="skpm-selected-sizes">
                    {form.sizes.map(size => (
                      <span className="skpm-selected-size" key={size}>
                        {size}
                        <button
                          type="button"
                          aria-label={`Remove ${size}`}
                          onClick={() => update(
                            "sizes",
                            form.sizes.filter(item => item !== size)
                          )}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="skpm-universal-variants">
            <label className="skpm-field-toggle">
              <input type="checkbox" checked={variantsEnabled} onChange={event => { setVariantsEnabled(event.target.checked); setVariantNotice(event.target.checked ? "Generate combinations before saving." : "Variants will be deactivated when you save."); }} />
              <span><strong>Enable purchasable combinations</strong><small>Each combination has its own SKU, price, stock and availability.</small></span>
            </label>

            {variantsEnabled && <>
              <p className="skpm-form-note">New combinations are shown with their starting stock. Review every price, stock quantity and availability before Save Changes; removed combinations are retained as inactive records.</p>
              {form.pricingMode !== "LENGTH_OPTIONS" && <div className="skpm-variant-attribute">
                <label className="skpm-field-toggle"><input type="checkbox" checked={lengthsEnabled} onChange={event => { setLengthsEnabled(event.target.checked); if (event.target.checked) setVariantsEnabled(true); }}/><span><strong>Enable Length</strong><small>Use lengths as another product option.</small></span></label>
                {lengthsEnabled && <><div className="skpm-variant-value-entry"><input aria-label="Length value" value={lengthDraft} placeholder="e.g. 1.5m or custom length" onChange={event => setLengthDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addLength(lengthDraft); } }}/><button type="button" className="skpm-secondary-action" onClick={() => addLength(lengthDraft)}><Plus size={15}/> Add Length</button></div><div className="skpm-variant-chips">{lengthValues.map(value => <button type="button" key={value} onClick={() => { setLengthValues(values => values.filter(item => item !== value)); setVariantsDirty(true); setVariantNotice("Unsaved variation changes"); }}>{value} ×</button>)}</div></>}
              </div>}

              {customAttributes.map((group, index) => <div className="skpm-variant-attribute" key={`${group.name}-${index}`}><div className="skpm-variant-value-entry"><input aria-label="Custom attribute name" value={group.name} placeholder="Attribute name (e.g. Material)" onChange={event => updateAttributeGroup(index, { name:event.target.value })}/><input aria-label={`Value for ${group.name || "custom attribute"}`} value={group.draft} placeholder="Add value" onChange={event => updateAttributeGroup(index, { draft:event.target.value })} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addAttributeValue(index); } }}/><button type="button" className="skpm-secondary-action" onClick={() => addAttributeValue(index)}><Plus size={15}/> Add Value</button><button type="button" className="skpm-remove-option" aria-label="Remove attribute" onClick={() => { setCustomAttributes(groups => groups.filter((_, i) => i !== index)); setVariantsDirty(true); setVariantNotice("Unsaved variation changes"); }}><Trash2 size={15}/></button></div><div className="skpm-variant-chips">{group.values.map(value => <button type="button" key={value} onClick={() => updateAttributeGroup(index, { values:group.values.filter(item => item !== value) })}>{value} ×</button>)}</div></div>)}
              <button type="button" className="skpm-secondary-action" onClick={() => setCustomAttributes(groups => [...groups, { name:"", values:[], draft:"" }])}><Plus size={15}/> Add Custom Attribute</button>
              {form.pricingMode === "LENGTH_OPTIONS" && <p className="skpm-form-note">Length, price and stock values come from Pricing &amp; Stock above. When combined with other attributes, each length&apos;s stock is split across its generated combinations.</p>}
              <button type="button" className="skpm-secondary-action" onClick={generateVariantCombinations}>Generate / Update Combinations</button>
              {variantsDirty && <span className="skpm-unsaved-variants" role="status">Unsaved variant changes</span>}
              {variantNotice && <p className="skpm-form-note" role="status">{variantNotice}</p>}
              {variants.length > 0 && <div className="skpm-variant-table-wrap"><table className="skpm-variant-table"><thead><tr><th>Combination</th><th>SKU</th><th>Price (₹)</th><th>Stock</th><th>Available</th></tr></thead><tbody>{variants.map((variant, index) => <tr key={variant.id || combinationKey(variant.attributes)}><td>{Object.entries(variant.attributes).map(([name,value]) => `${name}: ${value}`).join(" / ")}</td><td><input aria-label={`SKU for combination ${index + 1}`} value={variant.sku} onChange={event => updateVariant(index,{sku:event.target.value})}/></td><td><input aria-label={`Price for combination ${index + 1}`} type="number" min="0.01" step="0.01" value={variant.price} disabled={form.pricingMode === "LENGTH_OPTIONS"} onChange={event => updateVariant(index,{price:event.target.value})}/></td><td><input aria-label={`Stock for combination ${index + 1}`} type="number" min="0" step="1" value={variant.stock} disabled={form.pricingMode === "LENGTH_OPTIONS"} onChange={event => updateVariant(index,{stock:event.target.value})}/></td><td><input aria-label={`Availability for combination ${index + 1}`} type="checkbox" checked={variant.isActive} onChange={event => updateVariant(index,{isActive:event.target.checked})}/></td></tr>)}</tbody></table></div>}
            </>}
          </div>
        </div>

        <div className="skpm-form-section">
          <h2>Product Specifications</h2>
          <div className="skpm-form-grid">
            <label className="skpm-field skpm-field-full">
              Brand
              <input value={form.brand}
                onChange={e => update("brand", e.target.value)}
                placeholder="Srikalahasti Kalamkari" />
              <small className="skpm-help">
                Default brand is editable for every product.
              </small>
            </label>

            <div className="skpm-field-full skpm-optional-fields">
              <label className="skpm-field-toggle">
                <input type="checkbox"
                  checked={form.showFabricMaterial}
                  onChange={e => update("showFabricMaterial", e.target.checked)} />
                <span>
                  <strong>Fabric Material</strong>
                  <small>Enable to add and display fabric material.</small>
                </span>
              </label>
              {form.showFabricMaterial && (
                <label className="skpm-field">
                  Fabric Material
                  <input value={form.fabricMaterial}
                    onChange={e => update("fabricMaterial", e.target.value)}
                    placeholder="Pure Cotton" />
                </label>
              )}
            </div>

            <div className="skpm-field-full skpm-optional-fields">
              <label className="skpm-field-toggle">
                <input type="checkbox"
                  checked={form.showLength}
                  onChange={e => update("showLength", e.target.checked)} />
                <span>
                  <strong>Product Length</strong>
                  <small>Enable only for products that have a length specification.</small>
                </span>
              </label>
              {form.showLength && (
                <label className="skpm-field">
                  Length
                  <input value={form.length}
                    onChange={e => update("length", e.target.value)}
                    placeholder="6.3 meters" />
                </label>
              )}
            </div>

            <div className="skpm-field-full skpm-optional-fields">
              <label className="skpm-field-toggle">
                <input type="checkbox"
                  checked={form.showWidth}
                  onChange={e => update("showWidth", e.target.checked)} />
                <span>
                  <strong>Product Width</strong>
                  <small>Enable only when width information is applicable.</small>
                </span>
              </label>
              {form.showWidth && (
                <label className="skpm-field">
                  Width
                  <input value={form.width}
                    onChange={e => update("width", e.target.value)}
                    placeholder="44 inches" />
                </label>
              )}
            </div>
            <label className="skpm-field skpm-field-full">
              Wash Care
              <textarea rows={3} value={form.washCare}
                onChange={e => update("washCare", e.target.value)}
                placeholder="Enter wash care instructions..." />
            </label>
          </div>
        </div>

        <div className="skpm-form-section">
          <h2>Storefront Settings</h2>

          <div className="skpm-field skpm-field-full">
            <label htmlFor="skpm-availability-status">
              Availability Status
            </label>
            <select
              id="skpm-availability-status"
              value={form.availabilityStatus}
              onChange={event =>
                update(
                  "availabilityStatus",
                  event.target.value as FormData["availabilityStatus"]
                )
              }
            >
              <option value="IN_STOCK">In Stock</option>
              <option value="OUT_OF_STOCK">Out of Stock</option>
              <option value="COMING_SOON">Coming Soon</option>
            </select>
            <small>
              {form.availabilityStatus === "IN_STOCK"
                ? "Purchasing requires available stock."
                : form.availabilityStatus === "OUT_OF_STOCK"
                  ? "Visible in the store; purchasing disabled."
                  : "Visible as Coming Soon; purchasing disabled."}
            </small>
          </div>

          <div className="skpm-toggle-grid">
            {([
              ["isActive", "Active Product", "Show product in the store"],
              ["isFeatured", "Featured Product", "Show in featured collections"],
              ["isNewArrival", "New Arrival", "Mark as a new arrival"],
              ["allowCOD", "Cash on Delivery", "Allow COD for this product"],
              ["freeShipping", "Free Shipping", "Offer free shipping"],
              ["allowEnquiry", "Product Enquiry", "Allow customers to enquire"],
            ] as const).map(([key, label, hint]) => (
              <label className="skpm-toggle" key={key}>
                <input type="checkbox" checked={form[key]}
                  onChange={e => update(key, e.target.checked)} />
                <span>
                  <strong>{label}</strong>
                  <small>{hint}</small>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="skpm-form-footer">
          <Link href="/admin/products" className="skpm-cancel-btn">
            Cancel
          </Link>
          <button type="submit" className="skpm-add-btn"
            disabled={loading || imagesUploading || productLoading || categoryLoading || categories.length === 0}>
            {loading
              ? <LoaderCircle className="skpm-spin" size={17} />
              : <Save size={17} />}
            {loading
              ? "Saving..."
              : imagesUploading
                ? "Uploading Images..."
                : productId ? "Save Changes" : "Save Product"}
          </button>
        </div>
      </form>
      )}
    </div>
    </>
  );
}
