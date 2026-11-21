import { z } from "zod";

export const categoryInput = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z.string().trim().min(2).max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  parentId: z.string().min(1).nullable().optional(),
  image: z.string().trim().max(500).nullable().optional(),
  isActive: z.boolean(),
}).strict();

export function validImage(image: string | null | undefined) {
  if (!image) return true;

  if (/^\/uploads\/categories\/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/.test(image)) {
    return true;
  }

  try {
    const url = new URL(image);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      url.hostname.length > 0;
  } catch {
    return false;
  }
}
