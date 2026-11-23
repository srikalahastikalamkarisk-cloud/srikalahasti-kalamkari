import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { resetLimitAllowed } from "./password-reset-validation";

type RateLimitKind = "request" | "redeem";

function hashedBucket(prefix: string, value: string) {
  return `admin-reset:${prefix}:${createHash("sha256").update(value).digest("hex")}`;
}

export async function checkAdminPasswordResetLimit(
  kind: RateLimitKind,
  email: string | null,
  clientAddress: string,
) {
  const now = new Date();
  const requestMode = kind === "request";
  const windowMs = requestMode ? 60 * 60_000 : 15 * 60_000;
  const emailLimit = requestMode ? 5 : 12;
  const addressLimit = requestMode ? 20 : 60;
  const buckets = [
    { key: hashedBucket(`${kind}:address`, clientAddress || "unknown"), limit: addressLimit },
    ...(email ? [{ key: hashedBucket(`${kind}:email`, email), limit: emailLimit }] : []),
  ];
  const expiresAt = new Date(now.getTime() + windowMs);

  try {
    const counts = await prisma.$transaction(async tx => {
      const result: number[] = [];
      for (const bucket of buckets) {
        await tx.$executeRaw`
          INSERT INTO PaymentRateLimit (\`key\`, count, windowStart, expiresAt, updatedAt)
          VALUES (${bucket.key}, 1, ${now}, ${expiresAt}, ${now})
          ON DUPLICATE KEY UPDATE
            count = IF(expiresAt <= ${now}, 1, count + 1),
            windowStart = IF(expiresAt <= ${now}, ${now}, windowStart),
            expiresAt = IF(expiresAt <= ${now}, ${expiresAt}, expiresAt),
            updatedAt = ${now}
        `;
        const rows = await tx.$queryRaw<Array<{ count: number }>>`
          SELECT count FROM PaymentRateLimit WHERE \`key\` = ${bucket.key} FOR UPDATE
        `;
        result.push(rows[0]?.count ?? bucket.limit + 1);
      }
      return result;
    });
    return buckets.every((bucket, index) => resetLimitAllowed([counts[index]], bucket.limit));
  } catch (error) {
    const rawCode = error && typeof error === "object" && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;
    const allowedCodes = new Set(["P1000", "P1001", "P2021", "ER_ACCESS_DENIED_ERROR", "ECONNREFUSED", "ETIMEDOUT"]);
    const code = typeof rawCode === "string" && allowedCodes.has(rawCode) ? rawCode : undefined;
    console.error("admin_password_reset_rate_limit_unavailable", code ? { code } : {});
    return false;
  }
}
