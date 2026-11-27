import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { packageStandalone } from "./package-standalone.mjs";

test("standalone package includes runtime files and omits untracked development and backup content", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sk-standalone-fixture-"));
  const standalone = path.join(root, "standalone");
  const project = path.join(root, "project");
  const publicRoot = path.join(project, "public");
  const prismaRoot = path.join(project, "prisma");
  const output = path.join(root, "release");
  try {
    await mkdir(path.join(standalone, ".next", "server"), { recursive: true });
    await mkdir(path.join(standalone, ".next", "static"), { recursive: true });
    await mkdir(path.join(standalone, "node_modules", "next"), { recursive: true });
    await mkdir(path.join(project, "src", "generated", "prisma"), { recursive: true });
    await mkdir(path.join(project, "scripts"), { recursive: true });
    await mkdir(path.join(project, "node_modules", "dotenv"), { recursive: true });
    await mkdir(path.join(standalone, "tests"), { recursive: true });
    await mkdir(path.join(standalone, "backups"), { recursive: true });
    await mkdir(path.join(project, ".next", "static"), { recursive: true });
    await mkdir(path.join(publicRoot, "uploads"), { recursive: true });
    await mkdir(path.join(prismaRoot, "migrations", "20261123020000_sample"), { recursive: true });
    await mkdir(path.join(prismaRoot, "fresh-install"), { recursive: true });

    for (const [name, value] of [
      [path.join(standalone, "server.js"), "server"],
      [path.join(standalone, "package.json"), "{}"],
      [path.join(standalone, ".next", "BUILD_ID"), "build-id"],
      [path.join(standalone, ".next", "server", "route.js"), "route"],
      [path.join(standalone, ".next", "static", "app.js"), "chunk"],
      [path.join(standalone, "node_modules", "next", "package.json"), "{}"],
      [path.join(project, "src", "generated", "prisma", "client.ts"), "client"],
      [path.join(project, "scripts", "start-cpanel.js"), "startup"],
      [path.join(project, "scripts", "hostycare-preflight.mjs"), "preflight"],
      [path.join(project, "node_modules", "dotenv", "package.json"), "{}"],
      [path.join(standalone, "tests", "test.mjs"), "test"],
      [path.join(standalone, "backups", "secret.bak"), "backup"],
      [path.join(standalone, ".env.production"), "secret"],
      [path.join(project, ".next", "static", "app.js"), "chunk"],
      [path.join(publicRoot, "favicon.ico"), "favicon"],
      [path.join(publicRoot, "srikalahasti-logo-optimized.webp"), "optimized logo"],
      [path.join(publicRoot, "uploads", "local.jpg"), "local media"],
      [path.join(prismaRoot, "schema.prisma"), "datasource db {}"],
      [path.join(prismaRoot, "migrations", "20261123020000_sample", "migration.sql"), "CREATE TABLE sample (id INT);"],
      [path.join(prismaRoot, "migrations", "migration_lock.toml"), "provider = \"mysql\""],
      [path.join(prismaRoot, "fresh-install", "README.md"), "baseline instructions"],
      [path.join(prismaRoot, "fresh-install", "baseline.prisma"), "datasource db {}"],
      [path.join(prismaRoot, "fresh-install", "baseline.sql"), "CREATE TABLE baseline (id INT);"],
    ]) {
      await mkdir(path.dirname(name), { recursive: true });
      await writeFile(name, value);
    }

    await packageStandalone({
      projectRoot: project,
      standaloneDir: standalone,
      staticDir: path.join(project, ".next", "static"),
      publicRoot,
      trackedPublicFiles: ["public/favicon.ico"],
      outputDir: output,
    });

    assert.equal(await readFile(path.join(output, "server.js"), "utf8"), "server");
    assert.equal(await readFile(path.join(output, "start-cpanel.js"), "utf8"), "startup");
    assert.equal(await readFile(path.join(output, "hostycare-preflight.mjs"), "utf8"), "preflight");
    assert.equal(await readFile(path.join(output, ".next", "static", "app.js"), "utf8"), "chunk");
    assert.equal(await readFile(path.join(output, "public", "favicon.ico"), "utf8"), "favicon");
    assert.equal(await readFile(path.join(output, "public", "srikalahasti-logo-optimized.webp"), "utf8"), "optimized logo");
    assert.equal(await readFile(path.join(output, "src", "generated", "prisma", "client.ts"), "utf8"), "client");
    assert.equal(await readFile(path.join(output, "prisma", "migrations", "20261123020000_sample", "migration.sql"), "utf8"), "CREATE TABLE sample (id INT);");
    assert.deepEqual((await readdir(output)).sort(), [".next", "hostycare-preflight.mjs", "node_modules", "package.json", "prisma", "public", "server.js", "src", "start-cpanel.js"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
