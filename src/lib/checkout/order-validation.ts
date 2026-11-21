import { z } from "zod";

export const customerSchema = z.object({
  name: z.string().trim().min(2).max(191),
  phone: z.string().regex(/^[6-9][0-9]{9}$/),
  email: z.email().max(191),
  address: z.string().trim().min(10).max(2000),
  landmark: z.string().trim().max(191).optional().default(""),
  city: z.string().trim().min(2).max(191),
  state: z.string().trim().min(2).max(191),
  pincode: z.string().regex(/^[1-9][0-9]{5}$/),
}).strict();

export const checkoutItemSchema = z.object({
  productId: z.string().trim().min(1).max(191),
  variantId: z.string().trim().min(1).max(191).optional(),
  quantity: z.number().int().min(1).max(20),
}).strict();

export const checkoutRequestSchema = z.object({
  customer: customerSchema,
  items: z.array(checkoutItemSchema).min(1).max(30),
  couponCode: z.string().trim().max(64).nullable().optional(),
}).strict().superRefine((data, ctx) => {
  const ids = new Set<string>();

  data.items.forEach((item, index) => {
    const key = JSON.stringify([
      item.productId,
      item.variantId ?? null,
    ]);

    if (ids.has(key)) {
      ctx.addIssue({
        code: "custom",
        path: ["items", index, "productId"],
        message: "Duplicate product option in checkout",
      });
    }

    ids.add(key);
  });
});

export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;
