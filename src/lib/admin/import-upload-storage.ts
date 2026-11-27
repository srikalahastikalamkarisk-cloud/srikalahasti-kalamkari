import { mediaStorageRoot } from "./media-storage";
import {
  mkdir, realpath, lstat, readFile,
  writeFile, rm, statfs, rename, stat, open, readdir
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

export const CHUNK_BYTES = 2 * 1024 * 1024;
export const CSV_BYTES = 100 * 1024 * 1024;
export const ZIP_BYTES = 500 * 1024 * 1024;

type UploadKind = "csv" | "zip";

const UPLOAD_EXPIRY_MS = 24 * 60 * 60 * 1000;

function activePath(directory: string, kind: UploadKind) {
  return path.join(directory, `active-${kind}`);
}

async function readJob(directory: string, kind: UploadKind) {
  const active = activePath(directory, kind);

  try {
    const job = JSON.parse(
      await readFile(path.join(active, "job.json"), "utf8")
    ) as UploadJob;

    return job;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function cleanupExpiredUploads(directory: string) {
  for (const kind of ["csv", "zip"] as const) {
    const active = activePath(directory, kind);
    const info = await stat(active).catch(error => {
      if (error.code === "ENOENT") return null;
      throw error;
    });

    if (!info) continue;

    if (Date.now() - info.mtimeMs > UPLOAD_EXPIRY_MS) {
      await rm(active, { recursive: true, force: true });
    }
  }
}

type UploadJob = {
  id: string;
  owner: string;
  kind: UploadKind;
  size: number;
  createdAt: number;
};

export class UploadError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

async function storage() {
  const root = await mediaStorageRoot();
  const directory = path.join(root, ".import-staging");

  await mkdir(directory, {
    recursive: true,
    mode: 0o700
  });

  const info = await lstat(directory);

  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    (info.mode & 0o077) !== 0 ||
    await realpath(directory) !== directory
  ) {
    throw new Error("Unsafe import staging directory");
  }

  return directory;
}


function processIsAlive(pid: number) {
  if (!Number.isSafeInteger(pid) || pid < 1) {
    return true;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

async function withLock<T>(
  action: (directory: string) => Promise<T>
) {
  const directory = await storage();
  const lock = path.join(directory, ".lock");
  const ownerPath = path.join(lock, "owner.json");
  const token = randomUUID();

  try {
    await mkdir(lock, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }

    const owner = await readFile(ownerPath, "utf8")
      .then(value => JSON.parse(value))
      .catch(() => null);

    if (
      owner &&
      Number.isSafeInteger(owner.pid) &&
      !processIsAlive(owner.pid)
    ) {
      throw new UploadError(
        "An interrupted import lock was detected. Server maintenance is required before retrying.",
        409
      );
    }

    throw new UploadError(
      "An import is currently busy. Retry shortly.",
      409
    );
  }

  try {
    await writeFile(
      ownerPath,
      JSON.stringify({
        pid: process.pid,
        token,
        createdAt: Date.now()
      }),
      { flag: "wx", mode: 0o600 }
    );

    await cleanupExpiredUploads(directory);

    return await action(directory);
  } finally {
    await rm(lock, {
      recursive: true,
      force: true
    });
  }
}

async function getJob(
  directory: string,
  owner: string,
  id: string
): Promise<UploadJob> {
  for (const kind of ["csv", "zip"] as const) {
    const job = await readJob(directory, kind);

    if (job?.owner === owner && job.id === id) {
      return job;
    }
  }

  throw new UploadError("Upload job not found", 404);
}

export async function startUpload(
  owner: string,
  kind: UploadKind,
  size: number
) {
  const limit = kind === "csv" ? CSV_BYTES : ZIP_BYTES;

  if (
    !Number.isSafeInteger(size) ||
    size < 1 ||
    size > limit
  ) {
    throw new UploadError("Invalid upload size", 413);
  }

  return withLock(async directory => {
    const disk = await statfs(directory);

    if (disk.bavail * disk.bsize < size * 2 + 256 * 1024 * 1024) {
      throw new UploadError("Insufficient temporary storage", 507);
    }

    for (const slot of ["csv", "zip"] as const) {
      const existing = await readJob(directory, slot);

      if (existing && existing.owner !== owner) {
        throw new UploadError(
          "Another admin has an active import",
          409
        );
      }
    }

    const active = activePath(directory, kind);

    try {
      await mkdir(active, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw new UploadError("An upload of this file type is already active", 409);
      }
      throw error;
    }

    const job: UploadJob = {
      id: randomUUID(),
      owner,
      kind,
      size,
      createdAt: Date.now()
    };

    try {
      await writeFile(
        path.join(active, "job.json"),
        JSON.stringify(job),
        { flag: "wx", mode: 0o600 }
      );
    } catch (error) {
      await rm(active, { recursive: true, force: true });
      throw error;
    }

    return {
      id: job.id,
      chunkBytes: CHUNK_BYTES,
      totalChunks: Math.ceil(size / CHUNK_BYTES)
    };
  });
}

export async function saveUploadChunk(
  owner: string,
  id: string,
  index: number,
  bytes: Buffer
) {
  return withLock(async directory => {
    const job = await getJob(directory, owner, id);
    const count = Math.ceil(job.size / CHUNK_BYTES);

    const assembled = await stat(
      path.join(activePath(directory, job.kind), "assembled")
    ).catch(error => {
      if (error.code === "ENOENT") return null;
      throw error;
    });

    if (assembled) {
      throw new UploadError("Upload already finalized", 409);
    }

    if (
      !Number.isSafeInteger(index) ||
      index < 0 ||
      index >= count
    ) {
      throw new UploadError("Invalid chunk index");
    }

    const expected = Math.min(
      CHUNK_BYTES,
      job.size - index * CHUNK_BYTES
    );

    if (bytes.length !== expected) {
      throw new UploadError("Invalid chunk size");
    }

    const active = activePath(directory, job.kind);
    const target = path.join(active, `chunk-${index}`);

    const existing = await readFile(target).catch(error => {
      if (error.code === "ENOENT") return null;
      throw error;
    });

    if (existing) {
      if (!existing.equals(bytes)) {
        throw new UploadError("Chunk content conflict", 409);
      }

      return { index, received: true, duplicate: true };
    }

    const temporary = path.join(
      active,
      `.chunk-${index}-${randomUUID()}`
    );

    try {
      await writeFile(temporary, bytes, {
        flag: "wx",
        mode: 0o600
      });

      await rename(temporary, target);
    } finally {
      await rm(temporary, { force: true });
    }

    return { index, received: true, duplicate: false };
  });
}

export async function cancelUpload(
  owner: string,
  id: string
) {
  return withLock(async directory => {
    const job = await getJob(directory, owner, id);

    await rm(activePath(directory, job.kind), {
      recursive: true,
      force: true
    });

    return { cancelled: true };
  });
}


async function inspectUpload(
  directory: string,
  job: UploadJob
) {
  const active = activePath(directory, job.kind);
  const count = Math.ceil(job.size / CHUNK_BYTES);
  const received: number[] = [];
  const missing: number[] = [];
  let uploadedBytes = 0;

  const assembled = await stat(
    path.join(active, "assembled")
  ).catch(error => {
    if (error.code === "ENOENT") return null;
    throw error;
  });

  if (assembled?.isFile() && assembled.size === job.size) {
    return {
      id: job.id,
      kind: job.kind,
      size: job.size,
      totalChunks: count,
      received: Array.from({ length: count }, (_, i) => i),
      missing: [],
      uploadedBytes: job.size,
      complete: true
    };
  }

  for (let index = 0; index < count; index++) {
    const expected = Math.min(
      CHUNK_BYTES,
      job.size - index * CHUNK_BYTES
    );

    const info = await stat(
      path.join(active, `chunk-${index}`)
    ).catch(error => {
      if (error.code === "ENOENT") return null;
      throw error;
    });

    if (info?.isFile() && info.size === expected) {
      received.push(index);
      uploadedBytes += expected;
    } else {
      missing.push(index);
    }
  }

  return {
    id: job.id,
    kind: job.kind,
    size: job.size,
    totalChunks: count,
    received,
    missing,
    uploadedBytes,
    complete: false
  };
}

export async function uploadStatus(
  owner: string,
  id: string
) {
  return withLock(async directory => {
    const job = await getJob(directory, owner, id);
    return inspectUpload(directory, job);
  });
}


export async function recoverUpload(owner: string) {
  return withLock(async directory => {
    const uploads = [];

    for (const kind of ["csv", "zip"] as const) {
      const job = await readJob(directory, kind);

      if (job?.owner === owner) {
        uploads.push(await inspectUpload(directory, job));
      }
    }

    return {
      active: uploads.length > 0,
      uploads
    };
  });
}

export async function finalizeUpload(
  owner: string,
  id: string
) {
  return withLock(async directory => {
    const job = await getJob(directory, owner, id);
    const state = await inspectUpload(directory, job);

    if (state.complete) return state;

    if (state.missing.length) {
      throw new UploadError(
        `Upload incomplete: ${state.missing.length} chunks missing`,
        409
      );
    }

    const active = activePath(directory, job.kind);
    const target = path.join(active, "assembled");
    const temporary = path.join(active, ".assembling");

    await rm(temporary, { force: true });

    const output = await open(temporary, "wx", 0o600);
    let total = 0;

    try {
      try {
        for (let index = 0; index < state.totalChunks; index++) {
          const bytes = await readFile(
            path.join(active, `chunk-${index}`)
          );

          const expected = Math.min(
            CHUNK_BYTES,
            job.size - index * CHUNK_BYTES
          );

          if (bytes.length !== expected) {
            throw new UploadError("Chunk integrity check failed");
          }

          await output.writeFile(bytes);
          total += bytes.length;
        }

        if (total !== job.size) {
          throw new UploadError("Assembled file size mismatch");
        }

        await output.sync();
      } finally {
        await output.close();
      }

      await rename(temporary, target);

    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }

    for (const name of await readdir(active)) {
      if (/^chunk-\d+$/.test(name)) {
        await rm(path.join(active, name), { force: true });
      }
    }

    return inspectUpload(directory, job);
  });
}


export async function withStagedImport<T>(
  owner: string,
  csvId: string,
  zipId: string | null,
  action: (
    csvPath: string,
    zipPath: string | null
  ) => Promise<T>
) {
  return withLock(async directory => {
    const csv = await getJob(directory, owner, csvId);

    if (csv.kind !== "csv") {
      throw new UploadError("Invalid CSV upload ID");
    }

    if (!(await inspectUpload(directory, csv)).complete) {
      throw new UploadError("CSV upload is incomplete", 409);
    }

    const csvPath = path.join(
      activePath(directory, "csv"),
      "assembled"
    );

    let zipPath: string | null = null;

    if (zipId) {
      const zip = await getJob(directory, owner, zipId);

      if (zip.kind !== "zip") {
        throw new UploadError("Invalid ZIP upload ID");
      }

      if (!(await inspectUpload(directory, zip)).complete) {
        throw new UploadError("ZIP upload is incomplete", 409);
      }

      zipPath = path.join(
        activePath(directory, "zip"),
        "assembled"
      );
    }

    return action(csvPath, zipPath);
  });
}
