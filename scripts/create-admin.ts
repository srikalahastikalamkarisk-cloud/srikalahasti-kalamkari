import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { hash } from "bcryptjs";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const rl = createInterface({ input: stdin, output: stdout });

async function main() {
  const name = (await rl.question("Admin Name: ")).trim();
  const email = (await rl.question("Admin Email: ")).trim().toLowerCase();
  const password = await rl.question("Admin Password (visible while typing): ");

  rl.close();

  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12) {
    throw new Error("Enter a name, valid email and password of at least 12 characters.");
  }

  const prisma = new PrismaClient({
    adapter: new PrismaMariaDb(process.env.DATABASE_URL!),
  });

  try {
    const existing = await prisma.adminUser.count();

    if (existing > 0) {
      throw new Error("Admin already exists. Automatic creation blocked.");
    }

    await prisma.adminUser.create({
      data: {
        name,
        email,
        passwordHash: await hash(password, 12),
        role: "SUPER_ADMIN",
      },
    });

    console.log("SUCCESS: Super Admin account created!");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("ERROR:", error.message);
  process.exitCode = 1;
});
