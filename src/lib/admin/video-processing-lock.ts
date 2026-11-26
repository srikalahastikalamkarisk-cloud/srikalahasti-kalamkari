import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { VideoProcessingError } from "@/lib/admin/video-processing-errors";

const STALE_LOCK_AGE_MS = 10 * 60 * 1000;

type LockOwner = { token: string; pid: number; host: string; startedAt: number };

function isProcessAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function removeStaleLock(directory: string) {
  const reaper = `${directory}.reaper`;
  try { await mkdir(reaper, { mode: 0o700 }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
  try {
    const ownerPath = path.join(directory, "owner.json");
    const [owner, directoryInfo] = await Promise.all([
      readFile(ownerPath, "utf8").then(text => JSON.parse(text) as LockOwner).catch(() => null),
      stat(directory).catch(() => null),
    ]);
    if (!directoryInfo || Date.now() - directoryInfo.mtimeMs < STALE_LOCK_AGE_MS) return false;

    // This lock is scoped to the local persistent media root. Never infer that
    // a remote host's process is dead; only reclaim a same-host owner we can check.
    const ownerIsDead = owner?.host === os.hostname() && Number.isSafeInteger(owner.pid)
      ? !isProcessAlive(owner.pid)
      : owner === null;
    if (!ownerIsDead) return false;

    await rm(directory, { recursive: true, force: true });
    return true;
  } finally {
    await rm(reaper, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function acquireVideoProcessingLock(root: string) {
  const directory = path.join(root, ".video-optimization-lock");
  const owner: LockOwner = {
    token: randomUUID(),
    pid: process.pid,
    host: os.hostname(),
    startedAt: Date.now(),
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await mkdir(directory, { mode: 0o700 });
      await writeFile(path.join(directory, "owner.json"), JSON.stringify(owner), {
        flag: "wx",
        mode: 0o600,
      });
      let released = false;
      return async () => {
        if (released) return;
        released = true;
        const current = await readFile(path.join(directory, "owner.json"), "utf8")
          .then(text => JSON.parse(text) as LockOwner)
          .catch(() => null);
        if (current?.token === owner.token) {
          await rm(directory, { recursive: true, force: true });
        }
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") {
        const category = code === "EACCES" || code === "EPERM"
          ? "storage_permission"
          : code === "ENOSPC"
            ? "storage_space"
            : "internal";
        throw new VideoProcessingError(category, "lock", "Could not acquire video processing lock", error);
      }

      if (attempt === 0 && await removeStaleLock(directory)) continue;
      throw new VideoProcessingError("busy", "lock", "Video processing is already in progress");
    }
  }

  throw new VideoProcessingError("busy", "lock", "Video processing is already in progress");
}
