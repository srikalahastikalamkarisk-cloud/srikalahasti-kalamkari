import "server-only";

import { prisma } from "@/lib/prisma";
import {
  defaultAboutKalamkariContent,
  defaultAboutCategoryIds,
  isAboutTableMissing,
  isSafeAboutButtonHref,
  isSafeAboutImageUrl,
  resolveAboutCategories,
  type AboutCategorySource,
  type AboutKalamkariContent,
} from "@/lib/about-kalamkari-content";

export type AboutCategoryLink = {
  id: string;
  name: string;
  href: string;
};

const homepageCategories = () => prisma.category.findMany({
  where: { isActive: true, parentId: null },
  orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  select: { id: true, name: true, slug: true, parentId: true, isActive: true },
});

function categoryLinks(categories: AboutCategorySource[], ids: string[]) {
  return resolveAboutCategories(ids, categories);
}

export async function getHomepageAboutKalamkari(): Promise<{
  content: AboutKalamkariContent;
  categories: AboutCategoryLink[];
  configured: boolean;
}> {
  try {
    const categories = await homepageCategories();
    let record;

    try {
      record = await prisma.aboutKalamkariContent.findUnique({ where: { id: "primary" } });
    } catch (error) {
      if (!isAboutTableMissing(error)) throw error;
      console.warn("About Kalamkari content table is not migrated; showing defaults.");
      const ids = defaultAboutCategoryIds(categories);
      return {
        content: { ...defaultAboutKalamkariContent, categoryIds: ids },
        categories: categoryLinks(categories, ids),
        configured: false,
      };
    }

    if (!record) {
      const ids = defaultAboutCategoryIds(categories);
      return {
        content: { ...defaultAboutKalamkariContent, categoryIds: ids },
        categories: categoryLinks(categories, ids),
        configured: false,
      };
    }

    const ids = Array.isArray(record.categoryIds)
      ? record.categoryIds.filter((value): value is string => typeof value === "string")
      : [];
    let imageUrl = isSafeAboutImageUrl(record.imageUrl) ? record.imageUrl ?? null : null;

    if (imageUrl?.startsWith("/api/media/products/")) {
      const storageKey = imageUrl.split("/").pop()!;
      const asset = await prisma.mediaAsset.findUnique({
        where: { storageKey },
        select: { mimeType: true, deletionPending: true },
      });
      if (!asset || asset.deletionPending || !asset.mimeType.startsWith("image/")) imageUrl = null;
    }

    const content: AboutKalamkariContent = {
      eyebrow: record.eyebrow,
      heading: record.heading,
      descriptionOne: record.descriptionOne,
      descriptionTwo: record.descriptionTwo,
      imageUrl,
      imageAlt: record.imageAlt,
      imageCaption: record.imageCaption,
      categoryIds: ids,
      buttonText: record.buttonText,
      buttonHref: record.buttonHref,
    };

    return {
      content: {
        ...content,
        buttonHref: isSafeAboutButtonHref(content.buttonHref)
          ? content.buttonHref
          : defaultAboutKalamkariContent.buttonHref,
      },
      categories: categoryLinks(categories, ids),
      configured: true,
    };
  } catch (error) {
    console.error("About Kalamkari content load failed", error);
    return {
      content: defaultAboutKalamkariContent,
      categories: [],
      configured: false,
    };
  }
}
