import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { validOrigin } from "@/lib/admin/origin";
import { detachImage } from "@/lib/admin/media-policy";
import { assertManagedMediaAvailable, collectProtectedMedia, parseManagedMedia, queueReleasedMedia } from "@/lib/admin/global-media-references";
import { lockMediaMutation } from "@/lib/admin/media-mutation-lock";

type Context = { params: Promise<{ id: string }> };
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("move"), folderId: z.string().nullable() }),
  z.object({ action: z.literal("remove-product"), productId: z.string() }),
  z.object({ action: z.literal("preview-delete") }),
]);

async function references(id: string) {
  const asset = await prisma.mediaAsset.findUnique({ where: { id }, include: { references: { include: { product: { select: { id: true, name: true, images: true } } } } } });
  if (!asset) return null;
  const url = `/api/media/products/${asset.storageKey}`;
  const products = await prisma.product.findMany({ select: { id: true, name: true, slug: true, images: true } });
  const affected = products.flatMap(product => {
    const images = Array.isArray(product.images) ? product.images.filter((item): item is string => typeof item === "string") : [];
    return images.includes(url) ? [{ id: product.id, name: product.name, slug: product.slug }] : [];
  });
  const registryProductIds = new Set(asset.references.filter(reference => reference.placement === "PRODUCT" && reference.productId).map(reference => reference.productId!));
  const untracked = affected.filter(product => !registryProductIds.has(product.id));
  const unsupported = asset.references.filter(reference => reference.placement !== "PRODUCT").map(reference => reference.placement);
  const [categories, settings] = await Promise.all([
    prisma.category.findMany({ where: { image: url }, select: { id: true, name: true } }),
    prisma.storeSettings.findMany({ where: { OR: [{ logoUrl: url }, { faviconUrl: url }] }, select: { id: true, storeName: true, logoUrl: true, faviconUrl: true } }),
  ]);
  const otherLocations = [
    ...categories.map(category => ({ type: "Category image", name: category.name, id: category.id })),
    ...settings.flatMap(store => [
      ...(store.logoUrl === url ? [{ type: "Store logo", name: store.storeName, id: store.id }] : []),
      ...(store.faviconUrl === url ? [{ type: "Store favicon", name: store.storeName, id: store.id }] : []),
    ]),
  ];
  let aboutPage: { id: string; content: Prisma.JsonValue } | null = null;
  try { aboutPage = await prisma.aboutPageContent.findUnique({ where: { id: "primary" } }); }
  catch (error) {
    const knownMissing = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021" && error.message.includes("AboutPageContent");
    if (!knownMissing) throw error;
  }
  const aboutContent = aboutPage?.content && typeof aboutPage.content === "object" && !Array.isArray(aboutPage.content) ? aboutPage.content as Record<string, unknown> : null;
  const aboutLocations: { type: string; name: string; id: string }[] = [];
  if (aboutContent) {
    const root = aboutContent.roots as Record<string, unknown> | undefined;
    if (root?.image === url) aboutLocations.push({ type: "About Page image", name: "Rooted in Srikalahasti", id: "primary" });
    const process = aboutContent.process as Record<string, unknown> | undefined;
    if (Array.isArray(process?.steps)) process.steps.forEach((step, index) => {
      if (step && typeof step === "object" && (step as Record<string, unknown>).image === url) aboutLocations.push({ type: "About Page image", name: `Process step ${index + 1}`, id: "primary" });
    });
    const team = aboutContent.team as Record<string, unknown> | undefined;
    if (Array.isArray(team?.members)) team.members.forEach((member, index) => {
      if (member && typeof member === "object" && (member as Record<string, unknown>).photo === url) aboutLocations.push({ type: "About Page image", name: `Team portrait ${index + 1}`, id: "primary" });
    });
  }
  const protectedUrls = await prisma.$transaction(tx => collectProtectedMedia(tx));
  const protectedByOtherPlacement = [...protectedUrls].some(value => value !== url && parseManagedMedia(value)?.storageKey === asset.storageKey);
  return { asset, url, affected, untracked, unsupported, otherLocations: [...otherLocations, ...aboutLocations], canDelete: affected.length === 0 && untracked.length === 0 && unsupported.length === 0 && otherLocations.length === 0 && aboutLocations.length === 0 && !asset.folderId && !protectedByOtherPlacement };
}

export async function POST(req: NextRequest, context: Context) {
  if (!await getCurrentAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!validOrigin(req)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const { id } = await context.params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid media action" }, { status: 400 });
  if (parsed.data.action === "preview-delete") {
    const info = await references(id);
    if (!info) return NextResponse.json({ error: "Media not found" }, { status: 404 });
    return NextResponse.json({ products: info.affected, otherLocations: info.otherLocations, unsupportedPlacements: info.unsupported, untrackedProductReferences: info.untracked, canDelete: info.canDelete });
  }
  if (parsed.data.action === "move") {
    const folderId = parsed.data.folderId;
    if (folderId && !await prisma.mediaFolder.findUnique({ where: { id: folderId }, select: { id: true } })) return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    await prisma.$transaction(async tx => {
      const asset = await tx.mediaAsset.findUniqueOrThrow({ where: { id }, select: { storageKey: true } });
      await assertManagedMediaAvailable(tx, `/api/media/products/${asset.storageKey}`);
      await tx.mediaAsset.update({ where: { id }, data: { folderId } });
    });
    return NextResponse.json({ success: true });
  }
  const { productId } = parsed.data;
  try {
    await prisma.$transaction(async tx => {
      await lockMediaMutation(tx);
      const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM Product WHERE id = ${productId} FOR UPDATE`;
      if (!rows.length) throw new Error("Product not found");
      const [asset, product] = await Promise.all([
        tx.mediaAsset.findUniqueOrThrow({ where: { id } }),
        tx.product.findUniqueOrThrow({ where: { id: productId }, select: { images: true } }),
      ]);
      const imageUrl = `/api/media/products/${asset.storageKey}`;
      const next = detachImage(product.images, imageUrl);
      await tx.product.update({ where: { id: productId }, data: { images: next.length ? next as Prisma.InputJsonValue : Prisma.JsonNull } });
      await tx.mediaReference.deleteMany({ where: { mediaId: id, productId, placement: "PRODUCT" } });
      const references = await tx.mediaReference.findMany({ where: { productId, placement: "PRODUCT" }, orderBy: { sortOrder: "asc" } });
      for (const [sortOrder, reference] of references.entries()) await tx.mediaReference.update({ where: { id: reference.id }, data: { sortOrder } });
      await queueReleasedMedia(tx, product.images, next);
    });
    revalidatePath("/", "layout");
    return NextResponse.json({ success: true });
  } catch { return NextResponse.json({ error: "Could not safely remove image from product" }, { status: 409 }); }
}

export async function DELETE(req: NextRequest, context: Context) {
  if (!await getCurrentAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!validOrigin(req)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const confirmation = await req.json().catch(() => null);
  if (!confirmation || confirmation.confirm !== true) return NextResponse.json({ error: "Explicit confirmation is required" }, { status: 400 });
  const { id } = await context.params;
  const info = await references(id);
  if (!info) return NextResponse.json({ error: "Media not found" }, { status: 404 });
  if (!info.canDelete) return NextResponse.json({ error: "Global deletion blocked: references cannot be safely traced", unsupportedPlacements: info.unsupported, untrackedProductReferences: info.untracked }, { status: 409 });
  let jobId: string;
  try {
    jobId = await prisma.$transaction(async tx => {
      await lockMediaMutation(tx);
      await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM MediaAsset WHERE id = ${id} FOR UPDATE`;
      // Serialize against product edits that might attach this exact URL during global deletion.
      await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM Product FOR UPDATE`;
      const currentRefs = await tx.mediaReference.findMany({ where: { mediaId: id } });
      if (currentRefs.some(reference => reference.placement !== "PRODUCT")) throw new Error("Unsupported media placement appeared during deletion");
      const currentProducts = await tx.product.findMany({ select: { id: true, images: true } });
      const currentAffected = currentProducts.filter(product => Array.isArray(product.images) && product.images.includes(info.url));
      const tracked = new Set(currentRefs.filter(reference => reference.productId).map(reference => reference.productId));
      if (currentAffected.some(product => !tracked.has(product.id))) throw new Error("Untracked product image appeared during deletion");
      const allReferences = await collectProtectedMedia(tx);
      if (allReferences.has(info.url) || info.asset.folderId) throw new Error("Media is still protected by a reference or Media Library folder");
      await tx.mediaAsset.update({ where: { id }, data: { deletionPending: true } });
      const media = parseManagedMedia(info.url);
      if (!media) throw new Error("Invalid managed media URL");
      const prior = await tx.mediaCleanupJob.findUnique({ where: { storageKey: media.storageKey } });
      if (prior?.status === "PROCESSING") throw new Error("Media cleanup is already in progress");
      return (await tx.mediaCleanupJob.upsert({
        where: { storageKey: media.storageKey },
        create: { storageKey: media.storageKey, area: media.area },
        update: { area: media.area, status: "PENDING", attempts: 0, nextAttemptAt: new Date(), leaseUntil: null, lockedBy: null, lastError: null, completedAt: null },
      })).id;
    });
  } catch { return NextResponse.json({ error: "Database reference cleanup failed; physical image retained" }, { status: 500 }); }
  for (const product of info.affected) revalidatePath(`/product/${product.slug}`);
  revalidatePath("/", "layout");
  return NextResponse.json({ success: true, queued: true, jobId, message: "Unreferenced media queued for safe background cleanup" }, { status: 202 });
}
