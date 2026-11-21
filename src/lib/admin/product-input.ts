import { z } from "zod";

export const productInput = z.object({
  name: z.string().trim().min(2).max(191),
  slug: z.string().trim().min(2).max(191)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().max(10000).nullable().optional(),
  shortDescription: z.string().max(2000).nullable().optional(),

  price: z.number().positive().finite(),
  originalPrice: z.number().positive().finite().nullable().optional(),
  pricingMode: z.enum(["FIXED", "PER_METER", "LENGTH_OPTIONS"]),
  pricePerMeter: z.number().positive().finite().nullable().optional(),

  stock: z.number().int().min(0).max(10000000).default(0),
  availabilityStatus: z.enum([
    "IN_STOCK",
    "OUT_OF_STOCK",
    "COMING_SOON",
  ]).default("IN_STOCK"),
  sku: z.string().trim().max(191).nullable().optional(),
  images: z.array(z.string().trim().min(1).max(1000)).max(20).optional(),

  brand: z.string().trim().max(191).nullable().optional(),
  fabricMaterial: z.string().trim().max(191).nullable().optional(),
  length: z.string().trim().max(191).nullable().optional(),
  width: z.string().trim().max(191).nullable().optional(),
  washCare: z.string().max(5000).nullable().optional(),

  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  isNewArrival: z.boolean().default(false),

  showColors: z.boolean().default(false),
  showSizes: z.boolean().default(false),
  showMeters: z.boolean().default(false),
  showSpecifications: z.boolean().default(false),
  showFabricMaterial: z.boolean().default(false),
  showLength: z.boolean().default(false),
  showWidth: z.boolean().default(false),
  showWashCare: z.boolean().default(false),

  allowCOD: z.boolean().default(false),
  freeShipping: z.boolean().default(false),
  allowEnquiry: z.boolean().default(true),

  seoTitle: z.string().max(191).nullable().optional(),
  seoDescription: z.string().max(5000).nullable().optional(),

  categoryId: z.string().min(1),
  colors: z.array(z.object({
    name: z.string().trim().min(1).max(100),
    hex: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  })).max(100).optional(),
  sizes: z.array(z.string().trim().min(1).max(50)).max(100).optional(),
  meterOptions: z.array(z.object({
    label: z.string().trim().min(1).max(100),
    meters: z.number().positive().finite(),
    price: z.number().positive().finite(),
    originalPrice: z.number().positive().finite().nullable().optional(),
    stock: z.number().int().min(0).default(0),
  })).max(100).optional(),
  specifications: z.array(z.object({
    label: z.string().trim().min(1).max(100),
    value: z.string().trim().min(1).max(1000),
  })).max(100).optional(),
}).strict().superRefine((data, ctx) => {
  if (data.originalPrice != null && data.originalPrice <= data.price) {
    ctx.addIssue({
      code: "custom",
      path: ["originalPrice"],
      message: "Original price must be greater than selling price",
    });
  }

  if (data.pricingMode === "PER_METER" &&
      (!data.pricePerMeter || data.pricePerMeter <= 0)) {
    ctx.addIssue({
      code: "custom",
      path: ["pricePerMeter"],
      message: "Price per meter is required",
    });
  }

  if (data.pricingMode === "LENGTH_OPTIONS" &&
      (!data.meterOptions || data.meterOptions.length === 0)) {
    ctx.addIssue({
      code: "custom",
      path: ["meterOptions"],
      message: "At least one length option is required",
    });
  }

  data.meterOptions?.forEach((option, index) => {
    if (option.originalPrice != null &&
        option.originalPrice <= option.price) {
      ctx.addIssue({
        code: "custom",
        path: ["meterOptions", index, "originalPrice"],
        message: "Original price must be greater than selling price",
      });
    }
  });
});
