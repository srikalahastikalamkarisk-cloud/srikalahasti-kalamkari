import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";

async function main() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL missing");

  const url = new URL(raw);
  const database = url.pathname.slice(1);

  if (
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    database !== "srikalahasti_kalamkari"
  ) {
    throw new Error("STOP: Unexpected database target");
  }

  console.log("PASS: Local database identity verified");

  const backupDir = "backups/admin-127c-categories";
  mkdirSync(backupDir, { recursive: true });

  const backup = join(backupDir, `before-${Date.now()}.sql`);

  const dump = spawnSync("mysqldump", [
    "--single-transaction",
    "--no-tablespaces",
    "-h", url.hostname,
    "-P", url.port || "3306",
    "-u", decodeURIComponent(url.username),
    database,
  ], {
    encoding: "buffer",
    env: {
      ...process.env,
      MYSQL_PWD: decodeURIComponent(url.password),
    },
    maxBuffer: 100 * 1024 * 1024,
  });

  if (dump.status !== 0 || !dump.stdout?.length) {
    throw new Error("STOP: Database backup failed");
  }

  writeFileSync(backup, dump.stdout);

  if (statSync(backup).size < 1000) {
    throw new Error("STOP: Backup verification failed");
  }

  console.log("PASS: Database backup created:", backup);

  const prisma = new PrismaClient({
    adapter: new PrismaMariaDb(raw),
  });

  const targets = [
    {
      parentId: "cmwk9uumu000i2jv17yrs30vh",
      name: "Kalamkari Running Fabrics",
      slug: "kalamkari-running-fabrics",
    },
    {
      parentId: "cmwk9uumv000j2jv12bfphqwq",
      name: "Kalamkari Lehengas",
      slug: "kalamkari-lehengas",
    },
    {
      parentId: "cmwk9uumt000h2jv1bl00q7n4",
      name: "Kalamkari Kurtas",
      slug: "kalamkari-kurtas",
    },
    {
      parentId: "cmwk9uumw000k2jv1egoc8t5t",
      name: "Kalamkari Home Decor",
      slug: "kalamkari-home-decor",
    },
  ];

  try {
    await prisma.$transaction(async tx => {
      for (const item of targets) {
        const parent = await tx.category.findUnique({
          where: { id: item.parentId },
        });

        if (!parent || parent.parentId !== null) {
          throw new Error(`Invalid parent: ${item.name}`);
        }

        const existing = await tx.category.findUnique({
          where: { slug: item.slug },
        });

        if (existing) {
          if (existing.parentId !== item.parentId) {
            throw new Error(`Slug conflict: ${item.slug}`);
          }
          console.log("EXISTS:", item.name);
          continue;
        }

        await tx.category.create({
          data: {
            name: item.name,
            slug: item.slug,
            parentId: item.parentId,
            isActive: true,
          },
        });

        console.log("CREATED:", item.name);
      }
    });

    console.log("\nPASS: Four subcategories verified");
    console.log("Products created: 0");
    console.log("Existing products modified: 0");
    console.log("Payments modified: 0");
    console.log("Razorpay LIVE: unchanged");

  } finally {
    await prisma.$disconnect();
  }
}

main().catch(error => {
  console.error("STOP:", error.message);
  process.exitCode = 1;
});
