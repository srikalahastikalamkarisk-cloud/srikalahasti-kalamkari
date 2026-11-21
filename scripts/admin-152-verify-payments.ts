import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const dbUrl = process.env.DATABASE_URL;
const keyId = process.env.RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_KEY_SECRET;

if (!dbUrl || !keyId || !keySecret) {
  throw new Error("Missing database or Razorpay credentials");
}

const db = new URL(dbUrl);

if (
  !["localhost", "127.0.0.1"].includes(db.hostname) ||
  decodeURIComponent(db.pathname.slice(1)) !==
    "srikalahasti_kalamkari"
) {
  throw new Error("STOP: Local database only");
}

if (!keyId.startsWith("rzp_live_")) {
  throw new Error("STOP: Expected Razorpay LIVE credentials");
}

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(dbUrl),
});

async function main() {
  const orders = await prisma.order.findMany({
    where: {
      orderStatus: "PENDING",
      paymentStatus: "UNPAID",
    },
    include: {
      paymentAttempts: true,
    },
  });

  for (const order of orders) {
    console.log("\nOrder:", order.orderNumber);

    for (const attempt of order.paymentAttempts) {
      if (!attempt.razorpayOrderId) {
        console.log("REVIEW: Missing Razorpay order ID");
        continue;
      }

      const response = await fetch(
        `https://api.razorpay.com/v1/orders/${encodeURIComponent(attempt.razorpayOrderId)}/payments`,
        {
          headers: {
            Authorization:
              "Basic " +
              Buffer.from(`${keyId}:${keySecret}`).toString("base64"),
          },
          signal: AbortSignal.timeout(15000),
        }
      );

      if (!response.ok) {
        console.log("REVIEW: Razorpay API HTTP", response.status);
        continue;
      }

      const result = await response.json();

      const statuses = (result.items ?? []).map(
        (payment: { status: string }) => payment.status
      );

      console.log("Razorpay payment statuses:", statuses);

      if (statuses.length === 0) {
        console.log("NO PAYMENTS FOUND — cancellation candidate");
      } else if (statuses.some((s: string) =>
        ["captured", "authorized", "refunded"].includes(s)
      )) {
        console.log("BLOCK: Payment activity requires reconciliation");
      } else {
        console.log("REVIEW: Verify payment state before cancellation");
      }
    }
  }
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
