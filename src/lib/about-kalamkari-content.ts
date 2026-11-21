import { z } from "zod";

export type AboutKalamkariContent = {
  eyebrow: string;
  heading: string;
  descriptionOne: string;
  descriptionTwo: string;
  imageUrl: string | null;
  imageAlt: string;
  imageCaption: string;
  categoryIds: string[];
  buttonText: string;
  buttonHref: string;
};

export const defaultAboutKalamkariContent: AboutKalamkariContent = {
  eyebrow: "OUR ART & HERITAGE",
  heading: "About Kalamkari",
  descriptionOne:
    "Kalamkari is a 3,000-year-old Indian hand-painted textile art whose name comes from the Persian words kalam (pen) and kari (craftsmanship). In Srikalahasti, Andhra Pradesh, this craft lives as a living tradition where artisans paint mythological narratives—especially scenes from the Ramayana and Mahabharata—directly onto cotton and silk using a bamboo pen and natural dyes.",
  descriptionTwo:
    "What sets Srikalahasti Kalamkari apart is its freehand drawing style, temple-inspired motifs, and a fully natural dyeing process that yields deep blacks, earthy reds, indigo blues, and warm yellows without synthetic chemicals. Each saree can take 10 days to 3 months to complete, depending on design complexity, because the fabric is washed, dried, painted, and re-washed after every color application.",
  imageUrl: null,
  imageAlt: "Srikalahasti Kalamkari heritage textile presentation",
  imageCaption: "THE ART OF THE HAND ✦ SRIKALAHASTI, INDIA",
  categoryIds: [],
  buttonText: "Read Our Story",
  buttonHref: "/about",
};

export const defaultAboutImageUrl = "/hero/heritage-desktop.jpg";
export const defaultAboutCategoryNames = ["Sarees", "Dupattas", "Fabrics", "Wall Paintings"];

export const aboutKalamkariInputSchema = z.object({
  eyebrow: z.string().trim().min(1).max(120),
  heading: z.string().trim().min(1).max(160),
  descriptionOne: z.string().trim().min(1).max(2400),
  descriptionTwo: z.string().trim().min(1).max(2400),
  imageUrl: z.union([
    z.literal("") ,
    z.literal(defaultAboutImageUrl),
    z.string().regex(/^\/api\/media\/products\/[a-f0-9-]{36}\.(?:jpg|png|webp)$/),
  ]).nullable(),
  imageAlt: z.string().trim().min(1).max(250),
  imageCaption: z.string().trim().max(250),
  categoryIds: z.array(z.string().trim().min(1).max(191)).max(50),
  buttonText: z.string().trim().min(1).max(100),
  buttonHref: z.string().trim().min(1).max(500).refine(isSafeAboutButtonHref, "Use a safe internal path."),
}).strict().refine(value => new Set(value.categoryIds).size === value.categoryIds.length, {
  path: ["categoryIds"],
  message: "A category can only be selected once.",
});

export type AboutCategorySource = { id: string; name: string; slug: string; parentId?: string | null; isActive?: boolean };

export function isSafeAboutButtonHref(value: string) {
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f]/.test(value)) return false;
  try {
    const parsed = new URL(value, "https://storefront.invalid");
    return parsed.origin === "https://storefront.invalid" && !/^\/\//.test(value);
  } catch {
    return false;
  }
}

export function isSafeAboutImageUrl(value: string | null | undefined): value is string | null | undefined {
  return !value || value === defaultAboutImageUrl || /^\/api\/media\/products\/[a-f0-9-]{36}\.(?:jpg|png|webp)$/.test(value);
}

export function isAboutTableMissing(error: unknown) {
  const item = error as { code?: string; message?: string; meta?: { table?: string } } | null;
  const text = `${item?.message ?? error ?? ""} ${item?.meta?.table ?? ""}`.toLowerCase();
  return text.includes("aboutkalamkaricontent") && (
    item?.code === "P2021" || text.includes("does not exist") || text.includes("doesn't exist") || text.includes("1146") || text.includes("no such table")
  );
}

export function defaultAboutCategoryIds(categories: AboutCategorySource[]) {
  const activeRoots = categories.filter(category => category.isActive !== false && !category.parentId);
  return defaultAboutCategoryNames.flatMap(name => {
    const category = activeRoots.find(item => item.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    return category ? [category.id] : [];
  });
}

export function isValidAboutCategorySelection(ids: string[], categories: AboutCategorySource[]) {
  if (new Set(ids).size !== ids.length) return false;
  const activeRoots = new Set(categories
    .filter(category => category.isActive !== false && !category.parentId)
    .map(category => category.id));
  return ids.every(id => activeRoots.has(id));
}

export function resolveAboutCategories(ids: string[], categories: AboutCategorySource[]) {
  const byId = new Map(categories
    .filter(category => category.isActive !== false && !category.parentId && /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(category.slug))
    .map(category => [category.id, category]));
  return ids.flatMap(id => {
    const category = byId.get(id);
    return category ? [{ id: category.id, name: category.name, href: `/shop?category=${encodeURIComponent(category.slug)}` }] : [];
  });
}
