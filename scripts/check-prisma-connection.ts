import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { config } from "dotenv";

config({ path: ".env", quiet: true });

async function main() {
  console.log("===== STEP 224: PRISMA ADAPTER TEST =====");

  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error("DATABASE_URL missing");
  }

  const parsed = new URL(url);

  if (
    parsed.hostname !== "127.0.0.1" ||
    parsed.port !== "3306" ||
    decodeURIComponent(parsed.pathname) !== "/srikalahasti_kalamkari"
  ) {
    throw new Error("Unexpected database target");
  }

  console.log("Local database target: VERIFIED");

  const prisma = new PrismaClient({
    adapter: new PrismaMariaDb(url),
  });

  try {
    const rows = await prisma.$queryRaw`SELECT 1 AS ok`;
    console.log("Prisma adapter query: PASS");
    console.log("Result:", rows);
  } catch (error) {
    console.log("Prisma adapter query: FAIL");
    console.log("Error name:", (error as Error).name);
    console.log("Error code:", (error as { code?: string }).code ?? "unknown");
    console.log("Check local error logs for details.");
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.log("Test failed:", error.name);
  console.log("Code:", error.code ?? "unknown");
  process.exitCode = 1;
});
