import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { validOrigin } from "@/lib/admin/origin";
import { readBoundedBody } from "@/lib/payments/request-guard-stream";
import {
  aboutKalamkariInputSchema,
  defaultAboutKalamkariContent,
  defaultAboutCategoryIds,
  defaultAboutImageUrl,
  isAboutTableMissing,
  isSafeAboutButtonHref,
  isValidAboutCategorySelection,
  isSafeAboutImageUrl,
} from "@/lib/about-kalamkari-content";
import { assertManagedMediaAvailable, queueReleasedMedia } from "@/lib/admin/global-media-references";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getCategories() {
  return prisma.category.findMany({
    where: { isActive: true, parentId: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, slug: true, parentId: true, isActive: true },
  });
}

async function safeImageUrl(value: string | null) {
  if (!value) return null;
  if (value === defaultAboutImageUrl) return value;
  if (!isSafeAboutImageUrl(value)) return null;
  const storageKey = value.split("/").pop();
  if (!storageKey) return null;
  const asset = await prisma.mediaAsset.findUnique({
    where: { storageKey },
    select: { mimeType: true, deletionPending: true },
  });
  return asset && !asset.deletionPending && asset.mimeType.startsWith("image/") ? value : null;
}

export async function GET() {
  if (!await getCurrentAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const categories = await getCategories();
    let record;
    let migrationRequired = false;
    try {
      record = await prisma.aboutKalamkariContent.findUnique({ where: { id: "primary" } });
    } catch (error) {
      if (!isAboutTableMissing(error)) throw error;
      migrationRequired = true;
      console.warn("About Kalamkari table is missing; admin is displaying defaults.");
    }

    const configured = Boolean(record);
    const content = record ? {
      eyebrow: record.eyebrow,
      heading: record.heading,
      descriptionOne: record.descriptionOne,
      descriptionTwo: record.descriptionTwo,
      imageUrl: await safeImageUrl(record.imageUrl),
      imageAlt: record.imageAlt,
      imageCaption: record.imageCaption,
      categoryIds: Array.isArray(record.categoryIds)
        ? record.categoryIds.filter((value): value is string => typeof value === "string")
        : [],
      buttonText: record.buttonText,
      buttonHref: isSafeAboutButtonHref(record.buttonHref) ? record.buttonHref : defaultAboutKalamkariContent.buttonHref,
    } : {
      ...defaultAboutKalamkariContent,
      categoryIds: defaultAboutCategoryIds(categories),
    };

    return NextResponse.json({
      content,
      categories,
      configured,
      migrationRequired,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("About Kalamkari admin GET failed", error);
    return NextResponse.json({ error: "Unable to load About Kalamkari settings" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  if (!await getCurrentAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!validOrigin(req)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  if (!req.body) return NextResponse.json({ error: "Missing request body" }, { status: 400 });

  const bounded = await readBoundedBody(req.body, 24 * 1024);
  if (!bounded.ok) return NextResponse.json({ error: "Invalid or oversized request" }, { status: bounded.status });

  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(bounded.body));
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = aboutKalamkariInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Review the About Kalamkari fields and try again.", issues: parsed.error.issues }, { status: 400 });

  const data = parsed.data;
  if (!isSafeAboutImageUrl(data.imageUrl)) return NextResponse.json({ error: "Choose an image from Media Library or restore the default image." }, { status: 400 });
  const imageUrl = data.imageUrl || null;

  try {
    if (imageUrl && imageUrl !== defaultAboutImageUrl) {
      const storageKey = imageUrl.split("/").pop()!;
      const asset = await prisma.mediaAsset.findUnique({
        where: { storageKey },
        select: { mimeType: true, deletionPending: true },
      });
      if (!asset || asset.deletionPending || !asset.mimeType.startsWith("image/")) {
        return NextResponse.json({ error: "That image is no longer available in Media Library." }, { status: 400 });
      }
    }

    const categories = await getCategories();
    if (!isValidAboutCategorySelection(data.categoryIds, categories)) {
      return NextResponse.json({ error: "One or more selected categories are inactive or unavailable. Refresh and choose again." }, { status: 400 });
    }

    const saved = await prisma.$transaction(async tx => {
    const old = await tx.aboutKalamkariContent.findUnique({ where: { id: "primary" } });
    await assertManagedMediaAvailable(tx, imageUrl);
    const updated = await tx.aboutKalamkariContent.upsert({
      where: { id: "primary" },
      create: {
        id: "primary",
        ...data,
        imageUrl,
        categoryIds: data.categoryIds as Prisma.InputJsonValue,
      },
      update: {
        ...data,
        imageUrl,
        categoryIds: data.categoryIds as Prisma.InputJsonValue,
      },
    });
    await queueReleasedMedia(tx, old, updated);
    return updated;
    });

    revalidatePath("/");
    return NextResponse.json({
      success: true,
      configured: true,
      content: {
        eyebrow: saved.eyebrow,
        heading: saved.heading,
        descriptionOne: saved.descriptionOne,
        descriptionTwo: saved.descriptionTwo,
        imageUrl: saved.imageUrl,
        imageAlt: saved.imageAlt,
        imageCaption: saved.imageCaption,
        categoryIds: data.categoryIds,
        buttonText: saved.buttonText,
        buttonHref: saved.buttonHref,
      },
    });
  } catch (error) {
    if (isAboutTableMissing(error)) {
      return NextResponse.json({ error: "About Kalamkari storage is not ready. Apply the approved About migration before saving." }, { status: 503 });
    }
    console.error("About Kalamkari admin PUT failed", error);
    return NextResponse.json({ error: "Unable to save About Kalamkari settings. No success was recorded." }, { status: 500 });
  }
}
