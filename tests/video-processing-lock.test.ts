import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, utimes, writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { acquireVideoProcessingLock } from "../src/lib/admin/video-processing-lock";
import { VideoProcessingError } from "../src/lib/admin/video-processing-errors";

test("video processing lock limits work across processes and releases idempotently", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sk-video-lock-"));
  try {
    const release = await acquireVideoProcessingLock(root);
    const modulePath = path.resolve("src/lib/admin/video-processing-lock.ts");
    const childScript = `const { acquireVideoProcessingLock } = require(${JSON.stringify(modulePath)}); acquireVideoProcessingLock(process.argv[1]).then(async release => { await release(); process.exit(3); }).catch(error => { console.log(error.category || "unexpected"); });`;
    const child = spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "-e", childScript, root], { encoding: "utf8" });
    assert.equal(child.status, 0, child.stderr);
    assert.equal(child.stdout.trim(), "busy");
    await assert.rejects(acquireVideoProcessingLock(root), error => error instanceof VideoProcessingError && error.category === "busy" && error.stage === "lock");
    await release();
    await release();
    const releaseAgain = await acquireVideoProcessingLock(root);
    await releaseAgain();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("video processing lock only reclaims aged locks with a dead local owner", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sk-video-stale-lock-"));
  const lock = path.join(root, ".video-optimization-lock");
  try {
    await mkdir(lock);
    await writeFile(path.join(lock, "owner.json"), JSON.stringify({
      token: "old-test-lock", pid: 2_000_000_000, host: os.hostname(), startedAt: 1,
    }));
    const old = new Date(Date.now() - 11 * 60 * 1000);
    await utimes(lock, old, old);
    const release = await acquireVideoProcessingLock(root);
    await release();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
