import { cp, lstat, mkdir, readlink, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

function fail(message) {
  throw new Error(`Standalone packaging failed: ${message}`);
}

async function copyDirectory(source, destination) {
  const info = await stat(source).catch(() => null);
  if (!info?.isDirectory()) fail(`required runtime directory is missing: ${path.basename(source)}`);
  await cp(source, destination, { recursive: true, force: true, verbatimSymlinks: true });
}

async function copyPublicAssets(publicRoot, destination, trackedPublicFiles) {
  await mkdir(destination, { recursive: true });
  for (const relative of trackedPublicFiles) {
    if (!relative.startsWith("public/") || relative.includes("..") || relative.includes("\\")) fail("invalid tracked public asset path");
    if (relative.startsWith("public/uploads/") || path.basename(relative) === ".DS_Store") fail("local upload or machine metadata appeared in tracked public assets");
    const source = path.join(publicRoot, relative.slice("public/".length));
    const sourceInfo = await lstat(source).catch(() => null);
    if (!sourceInfo?.isFile()) fail(`tracked public asset is missing or not a regular file: ${relative}`);
    const target = path.join(destination, relative.slice("public/".length));
    await mkdir(path.dirname(target), { recursive: true });
    await cp(source, target, { errorOnExist: true, force: false });
  }
}

async function copyMigrationTree(source, destination) {
  const dirs = (await readdir(source, { withFileTypes: true })).filter(entry => entry.isDirectory() && /^\d{14}_[a-z0-9_]+$/.test(entry.name)).sort((a, b) => a.name.localeCompare(b.name));
  if (!dirs.length) fail("no historical migration directories found");
  await mkdir(destination, { recursive: true });
  for (const dir of dirs) {
    const from = path.join(source, dir.name);
    const to = path.join(destination, dir.name);
    await mkdir(to);
    for (const name of await readdir(from)) {
      if (name !== "migration.sql") continue;
      const file = path.join(from, name);
      if (!(await lstat(file)).isFile()) fail("migration is not a regular file");
      await cp(file, path.join(to, name));
    }
    if (!(await stat(path.join(to, "migration.sql")).catch(() => null))?.isFile()) fail(`migration SQL is missing: ${dir.name}`);
  }
  const lock = path.join(source, "migration_lock.toml");
  if ((await lstat(lock).catch(() => null))?.isFile()) await cp(lock, path.join(destination, "migration_lock.toml"));
}

async function scanPackage(root) {
  root = await realpath(root);
  const forbiddenComponent = name => name === ".git" || name === ".DS_Store" || name === "backups" || name === "artifacts" || name === "logs" || /^\.env(?:\.|$)/i.test(name) || /(?:\.bak|\.backup(?:[-.]|$)|\.before(?:[-.]|$)|\.failed(?:[-.]|$)|\.broken(?:[-.]|$))$/i.test(name);
  async function walk(directory, relative = "") {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const item = path.join(directory, entry.name);
      const rel = relative ? `${relative}/${entry.name}` : entry.name;
      if (forbiddenComponent(entry.name)) fail(`forbidden release content: ${rel}`);
      if (entry.isSymbolicLink()) {
        const link = await readlink(item);
        if (path.isAbsolute(link)) fail(`unsafe symlink in package: ${rel}`);
        const actual = await realpath(item).catch(() => null);
        if (!actual || !actual.startsWith(`${root}${path.sep}`)) fail(`broken or escaping symlink in package: ${rel}`);
        continue;
      }
      if (entry.isDirectory()) await walk(item, rel);
      else if (!entry.isFile()) fail(`unexpected special file: ${rel}`);
    }
  }
  await walk(root);
  const top = new Set(await readdir(root));
  for (const required of ["server.js", "start-cpanel.js", "hostycare-preflight.mjs", "package.json", ".next", "node_modules", "src", "prisma", "public"]) {
    if (!top.has(required)) fail(`required package entry is absent: ${required}`);
  }
  for (const required of ["BUILD_ID", "static", "server"]) {
    if (!(await stat(path.join(root, ".next", required)).catch(() => null))) fail(`required Next output is absent: .next/${required}`);
  }
  if (!(await stat(path.join(root, "src/generated/prisma/client.ts")).catch(() => null))?.isFile()) fail("generated Prisma client is missing");
  if (!(await stat(path.join(root, "node_modules/dotenv/package.json")).catch(() => null))?.isFile()) fail("dotenv runtime package is missing");
  if (!(await stat(path.join(root, "prisma/schema.prisma")).catch(() => null))?.isFile()) fail("Prisma schema is missing");
  if (!(await stat(path.join(root, "prisma/fresh-install/baseline.sql")).catch(() => null))?.isFile()) fail("fresh-install baseline is missing");
}

async function countFiles(root) {
  let total = 0;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const item = path.join(root, entry.name);
    if (entry.isDirectory()) total += await countFiles(item);
    else if (entry.isFile()) total += 1;
  }
  return total;
}

export async function packageStandalone(options) {
  const output = path.resolve(options.outputDir);
  if (output === path.parse(output).root || output === path.resolve(options.projectRoot)) fail("refusing unsafe package output path");
  if (await lstat(output).catch(() => null)) fail("output directory already exists; choose a new temporary path");

  await mkdir(output, { recursive: false });
  try {
    for (const name of ["server.js", "package.json"]) {
      const src = path.join(options.standaloneDir, name);
      if (!(await lstat(src).catch(() => null))?.isFile()) fail(`standalone ${name} is missing`);
      await cp(src, path.join(output, name));
    }
    await copyDirectory(path.join(options.standaloneDir, ".next"), path.join(output, ".next"));
    await copyDirectory(path.join(options.standaloneDir, "node_modules"), path.join(output, "node_modules"));
    await copyDirectory(path.join(options.projectRoot, "src", "generated", "prisma"), path.join(output, "src", "generated", "prisma"));
    await copyDirectory(path.join(options.projectRoot, "node_modules", "dotenv"), path.join(output, "node_modules", "dotenv"));
    await copyDirectory(options.staticDir, path.join(output, ".next", "static"));
    for (const [source, target] of [
      [path.join(options.projectRoot, "scripts", "start-cpanel.js"), path.join(output, "start-cpanel.js")],
      [path.join(options.projectRoot, "scripts", "hostycare-preflight.mjs"), path.join(output, "hostycare-preflight.mjs")],
    ]) {
      if (!(await lstat(source).catch(() => null))?.isFile()) fail(`required deployment runtime file is missing: ${path.basename(source)}`);
      await cp(source, target, { errorOnExist: true, force: false });
    }

    const prismaRoot = path.join(options.projectRoot, "prisma");
    await mkdir(path.join(output, "prisma"), { recursive: true });
    await cp(path.join(prismaRoot, "schema.prisma"), path.join(output, "prisma", "schema.prisma"));
    await copyMigrationTree(path.join(prismaRoot, "migrations"), path.join(output, "prisma", "migrations"));
    await mkdir(path.join(output, "prisma", "fresh-install"), { recursive: true });
    for (const name of ["README.md", "baseline.prisma", "baseline.sql"]) await cp(path.join(prismaRoot, "fresh-install", name), path.join(output, "prisma", "fresh-install", name));

    await copyPublicAssets(options.publicRoot, path.join(output, "public"), options.trackedPublicFiles);
    await scanPackage(output);
    return output;
  } catch (error) {
    await import("node:fs/promises").then(({ rm }) => rm(output, { recursive: true, force: true }));
    throw error;
  }
}

async function main() {
  const outputDir = process.argv[2];
  if (!outputDir) fail("usage: node scripts/package-standalone.mjs <new-output-directory>");
  const projectRoot = process.cwd();
  const trackedPublicFiles = execFileSync("git", ["ls-files", "-z", "--", "public"], { cwd: projectRoot }).toString().split("\0").filter(Boolean);
  await packageStandalone({
    projectRoot,
    standaloneDir: path.join(projectRoot, ".next/standalone"),
    staticDir: path.join(projectRoot, ".next/static"),
    publicRoot: path.join(projectRoot, "public"),
    trackedPublicFiles,
    outputDir,
  });
  const files = await countFiles(outputDir);
  console.log(`Standalone release package verified (${files} files).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : "Standalone packaging failed.");
    process.exitCode = 1;
  });
}
