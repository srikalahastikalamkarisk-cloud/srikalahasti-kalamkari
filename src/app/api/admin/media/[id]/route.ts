import { NextRequest, NextResponse } from "next/server";
import { unlink } from "node:fs/promises";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { validOrigin } from "@/lib/admin/origin";
import { canGloballyDelete, detachImage } from "@/lib/admin/media-policy";
import { confinedMediaPath } from "@/lib/admin/media-storage";

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
  const unsupported = [
    ...asset.references.filter(reference => reference.placement !== "PRODUCT").map(reference => reference.placement),
    "Homepage sections (hardcoded, unindexed)",
    "Stories (hardcoded, unindexed)",
    "Banners and other static placements (unindexed)",
  ];
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
  return { asset, url, affected, untracked, unsupported, otherLocations: [...otherLocations, ...aboutLocations], canDelete: canGloballyDelete({ untrackedProductReferences: untracked.length, unsupportedPlacements: unsupported.length }) };
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
    if (parsed.data.folderId && !await prisma.mediaFolder.findUnique({ where: { id: parsed.data.folderId }, select: { id: true } })) return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    await prisma.mediaAsset.update({ where: { id }, data: { folderId: parsed.data.folderId } });
    return NextResponse.json({ success: true });
  }
  const { productId } = parsed.data;
  try {
    await prisma.$transaction(async tx => {
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
  let filePath: string;
  try { filePath = (await confinedMediaPath(info.asset.storageKey)).target; }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Safe persistent storage path is unavailable" }, { status: 503 }); }
  let jobId: string;
  try {
    jobId = await prisma.$transaction(async tx => {
      await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM MediaAsset WHERE id = ${id} FOR UPDATE`;
      // Serialize against product edits that might attach this exact URL during global deletion.
      await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM Product FOR UPDATE`;
      const currentRefs = await tx.mediaReference.findMany({ where: { mediaId: id } });
      if (currentRefs.some(reference => reference.placement !== "PRODUCT")) throw new Error("Unsupported media placement appeared during deletion");
      const currentProducts = await tx.product.findMany({ select: { id: true, images: true } });
      const currentAffected = currentProducts.filter(product => Array.isArray(product.images) && product.images.includes(info.url));
      const tracked = new Set(currentRefs.filter(reference => reference.productId).map(reference => reference.productId));
      if (currentAffected.some(product => !tracked.has(product.id))) throw new Error("Untracked product image appeared during deletion");
      for (const product of currentAffected) {
        const next = detachImage(product.images, info.url);
        await tx.product.update({ where: { id: product.id }, data: { images: next.length ? next as Prisma.InputJsonValue : Prisma.JsonNull } });
      }
      if (info.otherLocations.some(location => location.type === "Category image")) await tx.category.updateMany({ where: { image: info.url }, data: { image: null } });
      if (info.otherLocations.some(location => location.type === "Store logo")) await tx.storeSettings.updateMany({ where: { logoUrl: info.url }, data: { logoUrl: null } });
      if (info.otherLocations.some(location => location.type === "Store favicon")) await tx.storeSettings.updateMany({ where: { faviconUrl: info.url }, data: { faviconUrl: null } });
      let about;
      try { about = await tx.aboutPageContent.findUnique({ where: { id: "primary" } }); }
      catch (error) {
        const knownMissing = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021" && error.message.includes("AboutPageContent");
        if (!knownMissing) throw error;
      }
      if (about?.content && typeof about.content === "object" && !Array.isArray(about.content)) {
        const next = structuredClone(about.content) as Record<string, unknown>;
        const roots = next.roots as Record<string, unknown> | undefined;
        if (roots?.image === info.url) roots.image = "/images/products/ivory-peacock.webp";
        const process = next.process as Record<string, unknown> | undefined;
        if (Array.isArray(process?.steps)) process.steps = process.steps.map(step => step && typeof step === "object" && (step as Record<string, unknown>).image === info.url ? { ...(step as Record<string, unknown>), image: "" } : step);
        const team = next.team as Record<string, unknown> | undefined;
        if (Array.isArray(team?.members)) team.members = team.members.map(member => member && typeof member === "object" && (member as Record<string, unknown>).photo === info.url ? { ...(member as Record<string, unknown>), photo: "" } : member);
        await tx.aboutPageContent.update({ where: { id: "primary" }, data: { content: next as Prisma.InputJsonValue } });
      }
      await tx.mediaReference.deleteMany({ where: { mediaId: id } });
      await tx.mediaAsset.update({ where: { id }, data: { deletionPending: true } });
      return (await tx.mediaDeletionJob.create({ data: { mediaId: id, storageKey: info.asset.storageKey } })).id;
    });
  } catch { return NextResponse.json({ error: "Database reference cleanup failed; physical image retained" }, { status: 500 }); }
  for (const product of info.affected) revalidatePath(`/product/${product.slug}`);
  revalidatePath("/", "layout");
  try {
    await unlink(filePath).catch(error => {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
    });
    await prisma.mediaAsset.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    await prisma.mediaDeletionJob.update({ where: { id: jobId }, data: { status: "FAILED", attempts: { increment: 1 }, lastError: error instanceof Error ? error.message : "File deletion failed" } });
    return NextResponse.json({ error: "References were removed, but physical deletion failed and is queued for retry" }, { status: 503 });
  }
}
