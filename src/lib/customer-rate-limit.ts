import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

export type CustomerRateLimitResult = { allowed: boolean; retryAfterSeconds: number };

export async function checkCustomerRateLimit(scope: string, key: string, max: number, windowMs: number): Promise<CustomerRateLimitResult> {
  const now = new Date(); const expiresAt = new Date(now.getTime() + windowMs);
  const bucket = `customer:${scope}:${createHash("sha256").update(key).digest("hex")}`;
  try {
    const result = await prisma.$transaction(async tx => {
      await tx.$executeRaw`INSERT INTO PaymentRateLimit (\`key\`, count, windowStart, expiresAt, updatedAt) VALUES (${bucket}, 1, ${now}, ${expiresAt}, ${now}) ON DUPLICATE KEY UPDATE count = IF(expiresAt <= ${now}, 1, count + 1), windowStart = IF(expiresAt <= ${now}, ${now}, windowStart), expiresAt = IF(expiresAt <= ${now}, ${expiresAt}, expiresAt), updatedAt = ${now}`;
      const rows = await tx.$queryRaw<Array<{ count: number; expiresAt: Date }>>`SELECT count, expiresAt FROM PaymentRateLimit WHERE \`key\` = ${bucket} FOR UPDATE`;
      return rows[0] ?? { count: max + 1, expiresAt };
    });
    return {
      allowed: result.count <= max,
      retryAfterSeconds: Math.max(1, Math.ceil((result.expiresAt.getTime() - now.getTime()) / 1000)),
    };
  } catch {
    return { allowed: false, retryAfterSeconds: 60 };
  }
}

export async function customerRateAllowed(scope: string, key: string, max: number, windowMs: number) {
  return (await checkCustomerRateLimit(scope, key, max, windowMs)).allowed;
}
