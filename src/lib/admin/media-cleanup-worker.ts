import "server-only";
import { randomUUID } from "node:crypto";
import { lstat, unlink } from "node:fs/promises";
import type { PrismaClient, Prisma } from "@/generated/prisma/client";
import { lockMediaMutation } from "./media-mutation-lock";
import { collectProtectedMedia, getMediaEpoch, parseManagedMedia } from "./global-media-references";
import { confinedMediaPath } from "./media-storage";
import { MEDIA_CLEANUP_BATCH_SIZE, MEDIA_CLEANUP_BUDGET_MS, MEDIA_CLEANUP_LEASE_MS, MEDIA_CLEANUP_MAX_ATTEMPTS, nextJobStatus, retryAt } from "./media-cleanup-policy";

type Transaction = Prisma.TransactionClient;

async function scanCandidates(tx: Transaction) {
  const epoch = await getMediaEpoch(tx);
  const protectedUrls = await collectProtectedMedia(tx);
  const protectedKeys = new Set([...protectedUrls].flatMap(value => { const key = parseManagedMedia(value)?.storageKey; return key ? [key] : []; }));
  return { epoch, protectedKeys };
}

async function claimOne(prisma: PrismaClient, scannedEpoch: number, protectedKeys: Set<string>) {
  const owner = randomUUID();
  return prisma.$transaction(async tx => {
    await lockMediaMutation(tx);
    const afterLockEpoch = await getMediaEpoch(tx);
    if (afterLockEpoch !== scannedEpoch + 1) return null;
    const now = new Date();
    const job = await tx.mediaCleanupJob.findFirst({
      where: {
        OR: [
          { status: { in: ["PENDING", "FAILED"] }, nextAttemptAt: { lte: now }, attempts: { lt: MEDIA_CLEANUP_MAX_ATTEMPTS } },
          { status: "PROCESSING", leaseUntil: { lte: now } },
        ],
      }, orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
    });
    if (!job) return null;
    if (protectedKeys.has(job.storageKey)) {
      await tx.mediaCleanupJob.update({ where: { id: job.id }, data: { status: "PROTECTED", lockedBy: null, leaseUntil: null, lastError: "A managed reference or Media Library placement still protects this file" } });
      return { protected: true as const };
    }
    const claimed = await tx.mediaCleanupJob.updateMany({
      where: { id: job.id, OR: [{ status: { in: ["PENDING", "FAILED"] } }, { status: "PROCESSING", leaseUntil: { lte: now } }] },
      data: { status: "PROCESSING", attempts: { increment: 1 }, lockedBy: owner, leaseUntil: new Date(now.getTime() + MEDIA_CLEANUP_LEASE_MS), lastError: null },
    });
    return claimed.count === 1 ? { protected: false as const, id: job.id, storageKey: job.storageKey, area: job.area as "products" | "categories" | "hero-videos" | "story-videos", owner } : null;
  }, { isolationLevel: "ReadCommitted", maxWait: 5000, timeout: 15000 });
}

async function finish(prisma: PrismaClient, jobId: string, owner: string, ok: boolean, error?: string) {
  await prisma.$transaction(async tx => {
    await lockMediaMutation(tx);
    const job = await tx.mediaCleanupJob.findUnique({ where: { id: jobId } });
    if (!job || job.status !== "PROCESSING" || job.lockedBy !== owner) return;
    const attempts = job.attempts;
    if (ok) {
      if (job.area === "products") await tx.mediaAsset.deleteMany({ where: { storageKey: job.storageKey, folderId: null, references: { none: {} } } });
      await tx.mediaCleanupJob.update({ where: { id: jobId }, data: { status: "COMPLETED", completedAt: new Date(), lockedBy: null, leaseUntil: null, lastError: null } });
    } else {
      const status = nextJobStatus(attempts);
      await tx.mediaCleanupJob.update({ where: { id: jobId }, data: { status, nextAttemptAt: retryAt(attempts), lockedBy: null, leaseUntil: null, lastError: (error ?? "Filesystem cleanup failed").slice(0, 4000) } });
    }
  }, { isolationLevel: "ReadCommitted", maxWait: 5000, timeout: 15000 });
}

async function deleteClaimed(prisma: PrismaClient, job: { id: string; owner: string; storageKey: string; area: "products" | "categories" | "hero-videos" | "story-videos" }) {
  try {
    const { target } = await confinedMediaPath(job.storageKey, job.area);
    const info = await lstat(target).catch(error => {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
      throw error;
    });
    if (info?.isSymbolicLink()) throw new Error("Refusing to follow or remove a symlink media path");
    if (info && !info.isFile()) throw new Error("Refusing to delete a non-file media path");
    if (info) await unlink(target);
    await finish(prisma, job.id, job.owner, true);
    return true;
  } catch (error) {
    await finish(prisma, job.id, job.owner, false, error instanceof Error ? error.message : "Filesystem cleanup failed");
    console.error("Media cleanup job failed", { jobId: job.id, area: job.area, error: error instanceof Error ? error.message : "unknown error" });
    return false;
  }
}

export async function processMediaCleanupBatch(prisma: PrismaClient, options: { batchSize?: number; budgetMs?: number } = {}) {
  const started = Date.now();
  const limit = Math.min(MEDIA_CLEANUP_BATCH_SIZE, Math.max(1, options.batchSize ?? MEDIA_CLEANUP_BATCH_SIZE));
  const budget = Math.min(MEDIA_CLEANUP_BUDGET_MS, Math.max(500, options.budgetMs ?? MEDIA_CLEANUP_BUDGET_MS));
  let removed = 0, retried = 0, protectedCount = 0;
  while (removed + retried + protectedCount < limit && Date.now() - started < budget) {
    const scan = await prisma.$transaction(async tx => scanCandidates(tx), { isolationLevel: "ReadCommitted", maxWait: 5000, timeout: 20000 });
    const claim = await claimOne(prisma, scan.epoch, scan.protectedKeys);
    if (!claim) break;
    if (claim.protected) { protectedCount++; continue; }
    if (await deleteClaimed(prisma, claim)) removed++; else retried++;
  }
  return { removed, retried, protected: protectedCount, processed: removed + retried + protectedCount };
}
