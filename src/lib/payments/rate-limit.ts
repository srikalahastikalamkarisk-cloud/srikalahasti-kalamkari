import "server-only";

import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;

export async function checkPaymentRecoveryRateLimit(
  checkoutKey: string
): Promise<boolean> {
  const key = createHash("sha256")
    .update(checkoutKey)
    .digest("hex");

  const now = new Date();
  const expiresAt = new Date(now.getTime() + WINDOW_MS);

  try {
    const count = await prisma.$transaction(async tx => {
      await tx.$executeRaw`
        INSERT INTO PaymentRateLimit
          (\`key\`, \`count\`, windowStart, expiresAt, updatedAt)
        VALUES
          (${key}, 1, ${now}, ${expiresAt}, ${now})
        ON DUPLICATE KEY UPDATE
          \`count\` = IF(
            expiresAt <= ${now},
            1,
            \`count\` + 1
          ),
          windowStart = IF(
            expiresAt <= ${now},
            ${now},
            windowStart
          ),
          expiresAt = IF(
            expiresAt <= ${now},
            ${expiresAt},
            expiresAt
          ),
          updatedAt = ${now}
      `;

      const rows = await tx.$queryRaw<
        Array<{ count: number }>
      >`
        SELECT \`count\`
        FROM PaymentRateLimit
        WHERE \`key\` = ${key}
        FOR UPDATE
      `;

      return rows[0]?.count ?? MAX_REQUESTS + 1;
    });

    return count <= MAX_REQUESTS;
  } catch {
    // Fail closed if database operation fails.
    return false;
  }
}
