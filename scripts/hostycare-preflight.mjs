import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import { access, lstat, mkdir, open, readdir, realpath, stat, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";

const fail = message => { throw new Error(message); };
const require = createRequire(import.meta.url);

async function loadEnvironment(envFile) {
  const info = await lstat(envFile).catch(() => null);
  if (!path.isAbsolute(envFile) || !info?.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0) fail("protected environment file is not available with mode 0600");
  const dotenv = require("dotenv");
  const parsed = dotenv.config({ path: envFile, quiet: true, override: true });
  if (parsed.error) fail("protected environment file could not be loaded");
  if (process.env.NODE_ENV !== "production") fail("NODE_ENV must be production");
  if (!process.env.DATABASE_URL || /build_only|build_placeholder/i.test(process.env.DATABASE_URL)) fail("production DATABASE_URL is missing or is a build placeholder");
  if (!process.env.DEPLOY_DATABASE_NAME) fail("DEPLOY_DATABASE_NAME must identify the exact production schema");
  if (!process.env.MEDIA_STORAGE_DIR || !path.isAbsolute(process.env.MEDIA_STORAGE_DIR)) fail("MEDIA_STORAGE_DIR must be an absolute persistent directory");
  return new URL(process.env.DATABASE_URL);
}

function findBinary(names) {
  for (const name of names) {
    const result = spawnSync("sh", ["-c", "command -v \"$1\"", "sh", name], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    if (result.status === 0 && result.stdout.trim()) return result.stdout.trim();
  }
  fail("required MySQL client or dump utility is unavailable");
}

function mysqlOption(value) {
  if (/[\r\n\0]/.test(value)) fail("database connection field contains an unsupported character");
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

async function writeClientConfig(url) {
  if (url.protocol !== "mysql:") fail("production database URL must use MySQL");
  const db = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!db || db !== process.env.DEPLOY_DATABASE_NAME) fail("database URL does not match DEPLOY_DATABASE_NAME");
  if (!url.hostname || !url.username || !url.password) fail("production database connection is incomplete");
  const file = path.join(os.tmpdir(), `sk-mysql-client-${process.pid}-${randomUUID()}.cnf`);
  const text = [
    "[client]",
    `host=${mysqlOption(url.hostname)}`,
    `port=${mysqlOption(url.port || "3306")}`,
    `user=${mysqlOption(decodeURIComponent(url.username))}`,
    `password=${mysqlOption(decodeURIComponent(url.password))}`,
    "protocol=tcp",
    "default-character-set=utf8mb4",
    "",
  ].join("\n");
  const handle = await open(file, "wx", 0o600);
  try { await handle.writeFile(text, "utf8"); await handle.sync(); }
  finally { await handle.close(); }
  return { file, db };
}

function run(binary, args, options = {}) {
  const result = spawnSync(binary, args, {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: options.stdoutFd ? ["ignore", options.stdoutFd, "ignore"] : ["ignore", "pipe", "ignore"],
    timeout: options.timeout ?? 120_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) fail(options.failureMessage ?? "production preflight command failed");
  return result.stdout ?? "";
}

async function verifyMigrations(mysql, config, db, releaseRoot) {
  const query = "SELECT CONCAT(migration_name, CHAR(9), IF(finished_at IS NULL, '0', '1'), CHAR(9), IF(rolled_back_at IS NULL, '0', '1')) FROM _prisma_migrations";
  const text = run(mysql, [`--defaults-extra-file=${config}`, "--batch", "--raw", "--skip-column-names", `--database=${db}`, "-e", query], { failureMessage: "production migration state could not be read" });
  const applied = new Map();
  for (const line of text.split(/\r?\n/).filter(Boolean)) {
    const [name, finished, rolledBack] = line.split("\t");
    if (!name || applied.has(name) || finished !== "1" || rolledBack !== "1") fail("production schema has failed, pending, or duplicate migration records");
    applied.set(name, true);
  }
  const migrationsRoot = path.join(releaseRoot, "prisma", "migrations");
  const expected = (await readdir(migrationsRoot, { withFileTypes: true }))
    .filter(entry => entry.isDirectory() && /^\d{14}_[a-z0-9_]+$/.test(entry.name))
    .map(entry => entry.name)
    .sort();
  if (!expected.length || expected.length !== applied.size || expected.some(name => !applied.has(name))) {
    fail("database migration history does not exactly match this release; no automatic migrations are run");
  }
}

async function createBackup(dump, config, db, backupDir, sha) {
  const directory = await realpath(backupDir).catch(() => null);
  if (!directory) fail("pre-created database backup directory is missing");
  const info = await stat(directory);
  if (!info.isDirectory() || (info.mode & 0o077) !== 0) fail("database backup directory must have mode 0700");
  await access(directory, constants.W_OK).catch(() => fail("database backup directory is not writable"));
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
  const file = path.join(directory, `${sha}-${stamp}.sql`);
  const sumFile = `${file}.sha256`;
  const handle = await open(file, "wx", 0o600);
  try {
    run(dump, [
      `--defaults-extra-file=${config}`,
      "--single-transaction", "--quick", "--skip-lock-tables", "--routines", "--events", "--triggers", "--hex-blob",
      "--default-character-set=utf8mb4", db,
    ], { stdoutFd: handle.fd, timeout: 300_000, failureMessage: "database backup failed; release activation was stopped" });
    await handle.sync();
    const info = await handle.stat();
    if (!info.isFile() || info.size < 1024) fail("database backup output is empty or incomplete");
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    await writeFile(sumFile, `${hash.digest("hex")}  ${path.basename(file)}\n`, { flag: "wx", mode: 0o600 });
    return file;
  } catch (error) {
    await handle.close().catch(() => undefined);
    await unlink(file).catch(() => undefined);
    await unlink(sumFile).catch(() => undefined);
    throw error;
  } finally {
    await handle.close().catch(() => undefined);
  }
}

async function main() {
  const [envFile, backupDir, sha] = process.argv.slice(2);
  if (!envFile || !backupDir || !/^[a-f0-9]{40}$/.test(sha ?? "")) fail("usage: node hostycare-preflight.mjs <protected-env-file> <private-backup-dir> <commit-sha>");
  const releaseRoot = await realpath(process.cwd());
  if (Number(process.versions.node.split(".")[0]) !== 22) fail("HostyCare shell must provide Node.js 22");
  const url = await loadEnvironment(envFile);
  const mediaRoot = await realpath(process.env.MEDIA_STORAGE_DIR).catch(() => null);
  if (!mediaRoot || mediaRoot === releaseRoot || mediaRoot.startsWith(`${releaseRoot}${path.sep}`)) fail("persistent media storage must exist outside the release");
  for (const area of ["products", "categories", "hero-videos", "story-videos"]) {
    const areaPath = path.join(mediaRoot, area);
    const resolvedArea = await realpath(areaPath).catch(() => null);
    const info = await stat(areaPath).catch(() => null);
    if (!resolvedArea?.startsWith(`${mediaRoot}${path.sep}`) || !info?.isDirectory() || (info.mode & 0o022) !== 0) fail("persistent media areas must exist beneath the media root and have safe permissions");
    await access(resolvedArea, constants.W_OK).catch(() => fail("persistent media areas must be writable by the application user"));
  }
  const mysql = findBinary(["mariadb", "mysql"]);
  const dump = findBinary(["mariadb-dump", "mysqldump"]);
  const { file: config, db } = await writeClientConfig(url);
  try {
    await verifyMigrations(mysql, config, db, releaseRoot);
    await createBackup(dump, config, db, backupDir, sha);
  } finally {
    await unlink(config).catch(() => undefined);
  }
  console.log("Production preflight passed; migrations match and a private database backup was created.");
}

main().catch(error => {
  console.error(`Production preflight blocked: ${error instanceof Error ? error.message : "check failed"}`);
  process.exitCode = 1;
});
