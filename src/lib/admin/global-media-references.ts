import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { access, lstat } from "node:fs/promises";
import { confinedMediaPath, type MediaStorageArea } from "./media-storage";
import { lockMediaMutation } from "./media-mutation-lock";

type Transaction = Prisma.TransactionClient;
export type ManagedMedia = { url: string; storageKey: string; area: MediaStorageArea };
const MEDIA_KEY = /^([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\.(jpg|jpeg|png|webp|ico|mp4|webm)$/i;
const AREAS = new Set<MediaStorageArea>(["products", "categories", "hero-videos", "story-videos"]);

export function normalizeManagedMedia(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let pathname = value.trim();
  if (/^https?:\/\//i.test(pathname)) {
    try {
      const parsed = new URL(pathname);
      const allowedOrigin = process.env.MEDIA_PUBLIC_ORIGIN?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim() || "";
      if (!allowedOrigin || parsed.origin !== new URL(allowedOrigin).origin) return null;
      pathname = parsed.pathname;
    } catch { return null; }
  }
  pathname = pathname.split(/[?#]/)[0].replace(/^\/uploads\//, "/api/media/");
  const match = /^\/api\/media\/(products|categories|hero-videos|story-videos)\/([^/]+)$/.exec(pathname);
  if (!match || !AREAS.has(match[1] as MediaStorageArea) || !MEDIA_KEY.test(match[2])) return null;
  return pathname;
}

export function managedMediaUrl(value: unknown): value is string { return normalizeManagedMedia(value) !== null; }

export function parseManagedMedia(value: unknown): ManagedMedia | null {
  const url = normalizeManagedMedia(value);
  if (!url) return null;
  const match = /^\/api\/media\/(products|categories|hero-videos|story-videos)\/([^/]+)$/.exec(url)!;
  return { url, area: match[1] as MediaStorageArea, storageKey: match[2] };
}

export function collectManagedMedia(value: unknown, result = new Set<string>()): Set<string> {
  const normalized = normalizeManagedMedia(value);
  if (normalized) result.add(normalized);
  else if (Array.isArray(value)) for (const item of value) collectManagedMedia(item, result);
  else if (value && typeof value === "object") for (const item of Object.values(value)) collectManagedMedia(item, result);
  return result;
}

export async function collectProtectedMedia(tx: Transaction) {
  const protectedUrls = new Set<string>();
  const add = (value: unknown) => collectManagedMedia(value, protectedUrls);
  const [products, variants, categories, orders, heroes, stories, gallery, settings, aboutKalamkari, aboutPage, references, library] = await Promise.all([
    tx.product.findMany({ select: { images: true, specifications: true } }),
    tx.productVariant.findMany({ select: { imageUrl: true, attributes: true } }),
    tx.category.findMany({ select: { image: true } }),
    tx.orderItem.findMany({ select: { productImage: true, variantSnapshot: true } }),
    tx.heroSlide.findMany({ select: { desktopImage: true, mobileImage: true, desktopVideo: true, mobileVideo: true, videoUrl: true, posterImage: true, desktopSourceUrl: true, mobileSourceUrl: true } }),
    tx.videoStory.findMany({ select: { videoUrl: true, mobileUrl: true, videoFile: true, posterImage: true } }),
    tx.customerGallery.findMany({ select: { imageUrl: true } }),
    tx.storeSettings.findMany({ select: { logoUrl: true, faviconUrl: true } }),
    tx.aboutKalamkariContent.findMany({ select: { imageUrl: true } }),
    tx.aboutPageContent.findMany({ select: { content: true } }),
    tx.mediaReference.findMany({ select: { media: { select: { storageKey: true } } } }),
    tx.mediaAsset.findMany({ where: { folderId: { not: null } }, select: { storageKey: true } }),
  ]);
  for (const value of [products, variants, categories, orders, heroes, stories, gallery, settings, aboutKalamkari, aboutPage]) add(value);
  for (const ref of references) add(`/api/media/products/${ref.media.storageKey}`);
  for (const asset of library) add(`/api/media/products/${asset.storageKey}`);
  return protectedUrls;
}

export async function findReleasedMedia(tx: Transaction, previous: unknown, current: unknown) {
  const before = collectManagedMedia(previous);
  const after = collectManagedMedia(current);
  const protectedUrls = await collectProtectedMedia(tx);
  return [...before].filter(url => !after.has(url) && !protectedUrls.has(url));
}

export async function queueReleasedMedia(tx: Transaction, previous: unknown, current: unknown) {
  await lockMediaMutation(tx);
  const candidates = await findReleasedMedia(tx, previous, current);
  const queued: string[] = [];
  for (const url of candidates) {
    const media = parseManagedMedia(url);
    if (!media) continue;
    const registered = media.area === "products" ? await tx.mediaAsset.findUnique({ where: { storageKey: media.storageKey }, select: { id: true, folderId: true, references: { select: { id: true } } } }) : null;
    if (registered?.folderId) continue;
    if (registered?.references.length) continue;
    const existing = await tx.mediaCleanupJob.findUnique({ where: { storageKey: media.storageKey } });
    if (existing?.status === "COMPLETED" || existing?.status === "PROCESSING") continue;
    await tx.mediaCleanupJob.upsert({
      where: { storageKey: media.storageKey },
      create: { storageKey: media.storageKey, area: media.area, status: "PENDING", nextAttemptAt: new Date() },
      update: { area: media.area, status: "PENDING", attempts: 0, nextAttemptAt: new Date(), leaseUntil: null, lockedBy: null, lastError: null, completedAt: null },
    });
    if (registered) await tx.mediaAsset.update({ where: { id: registered.id }, data: { deletionPending: true } });
    queued.push(url);
  }
  return queued;
}

/** Call inside the transaction that attaches a managed URL. The same database mutex
 * serializes writers with the worker; PROCESSING files cannot acquire new references. */
export async function assertManagedMediaAvailable(tx: Transaction, value: unknown) {
  await lockMediaMutation(tx);
  const urls = collectManagedMedia(value);
  for (const url of urls) {
    const media = parseManagedMedia(url);
    if (!media) continue;
    const job = await tx.mediaCleanupJob.findUnique({ where: { storageKey: media.storageKey } });
    if (job?.status === "PROCESSING") throw new Error("This media file is currently being cleaned up. Upload it again before using it.");
    if (job && ["PENDING", "FAILED", "PROTECTED"].includes(job.status)) {
      await tx.mediaCleanupJob.update({ where: { id: job.id }, data: { status: "CANCELLED", leaseUntil: null, lockedBy: null, lastError: "Rescued by a new media reference" } });
    }
    if (media.area === "products") await tx.mediaAsset.updateMany({ where: { storageKey: media.storageKey, deletionPending: true }, data: { deletionPending: false } });
    const { target } = await confinedMediaPath(media.storageKey, media.area);
    const info = await lstat(target).catch(() => null);
    if (!info || info.isSymbolicLink() || !info.isFile()) throw new Error("Managed media file is missing or unsafe. Upload it again before using it.");
    await access(target, 4);
  }
}

export async function reviewCleanupQueue(tx: Transaction) {
  const jobs = await tx.mediaCleanupJob.findMany({
    where: { status: { in: ["PENDING", "FAILED", "PROCESSING", "PROTECTED"] } },
    orderBy: { createdAt: "asc" }, take: 50,
  });
  if (!jobs.length) return [];
  const protectedUrls = await collectProtectedMedia(tx);
  const protectedKeys = new Set([...protectedUrls].flatMap(url => { const key = parseManagedMedia(url)?.storageKey; return key ? [key] : []; }));
  return jobs.map(job => ({
    id: job.id, mediaId: null, storageKey: job.storageKey, area: job.area,
    sizeBytes: null, status: job.status,
    eligible: !protectedKeys.has(job.storageKey) && job.status !== "PROCESSING",
    nextAttemptAt: job.nextAttemptAt,
  }));
}

export async function getMediaEpoch(tx: Pick<Prisma.TransactionClient, "storeSettings">) {
  const settings = await tx.storeSettings.findUnique({ where: { id: "primary" }, select: { mediaEpoch: true } });
  if (!settings) throw new Error("Media mutation lock unavailable");
  return settings.mediaEpoch;
}
