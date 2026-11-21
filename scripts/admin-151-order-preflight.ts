import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const url = process.env.DATABASE_URL;

if (!url) throw new Error("DATABASE_URL missing");

const parsed = new URL(url);

if (
  !["localhost", "127.0.0.1"].includes(parsed.hostname) ||
  decodeURIComponent(parsed.pathname.slice(1)) !==
    "srikalahasti_kalamkari"
) {
  throw new Error("STOP: Local development database only");
}

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(url),
});

async function main() {
  const orders = await prisma.order.findMany({
    where: {
      orderStatus: "PENDING",
      paymentStatus: "UNPAID",
    },
    select: {
      orderNumber: true,
      orderStatus: true,
      paymentStatus: true,
      inventoryStatus: true,
      paymentAttempts: {
        select: {
          status: true,
          razorpayOrderId: true,
          razorpayPaymentId: true,
        },
      },
    },
    take: 50,
    orderBy: { createdAt: "desc" },
  });

  console.log("Unpaid pending orders:", orders.length);

  for (const order of orders) {
    console.log("\nOrder:", order.orderNumber);
    console.log("Payment:", order.paymentStatus);
    console.log("Inventory:", order.inventoryStatus);
    console.log(
      "Attempts:",
      order.paymentAttempts.map(a => ({
        status: a.status,
        hasRazorpayOrder: Boolean(a.razorpayOrderId),
        hasRazorpayPayment: Boolean(a.razorpayPaymentId),
      }))
    );

    const safeCandidate =
      order.inventoryStatus === "PENDING" &&
      order.paymentAttempts.every(
        a => ["FAILED", "CREATE_FAILED"].includes(a.status)
      );

    console.log(
      "Cancellation candidate:",
      safeCandidate ? "YES - needs final verification" : "REVIEW REQUIRED"
    );
  }
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
