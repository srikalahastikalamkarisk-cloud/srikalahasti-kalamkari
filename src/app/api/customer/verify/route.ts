import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashCustomerToken, validCustomerToken } from "@/lib/customer-auth-core";

export const runtime = "nodejs";
const response = (body: Record<string, unknown>, status: number, requestId: string) => NextResponse.json(body, {
  status,
  headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
});

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  const startedAt = Date.now();
  let resultStatus = 500;
  let outcome = "database_error";
  try {
    const body = await request.json();
    const token = typeof body?.token === "string" ? body.token : "";
    if (!validCustomerToken(token)) {
      resultStatus = 400; outcome = "invalid_format";
      return response({ error: "This verification link is invalid or expired.", code: "invalid" }, resultStatus, requestId);
    }

    const tokenHash = hashCustomerToken(token);
    const now = new Date();
    const owner = await prisma.customerVerificationToken.findUnique({
      where: { tokenHash },
      select: { id: true, customerId: true, usedAt: true, expiresAt: true, customer: { select: { emailVerifiedAt: true } } },
    });
    if (owner?.customer.emailVerifiedAt) {
      resultStatus = 200; outcome = "already_verified";
      return response({ success: true, alreadyVerified: true, message: "This email address is already verified. You can sign in." }, resultStatus, requestId);
    }
    if (!owner || owner.usedAt || owner.expiresAt <= now) {
      resultStatus = 400;
      outcome = owner?.expiresAt && owner.expiresAt <= now ? "expired" : "invalid_or_used";
      return response({ error: "This verification link is invalid or expired. Request a new link to continue.", code: outcome === "expired" ? "expired" : "invalid" }, resultStatus, requestId);
    }

    const redemption = await prisma.$transaction(async tx => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM CustomerVerificationToken WHERE id = ${owner.id} AND tokenHash = ${tokenHash} AND usedAt IS NULL AND expiresAt > ${now} FOR UPDATE`;
      if (!rows.length) {
        const current = await tx.customer.findUnique({ where: { id: owner.customerId }, select: { emailVerifiedAt: true } });
        if (current?.emailVerifiedAt) return "already-verified" as const;
        return "unavailable" as const;
      }
      const consumed = await tx.customerVerificationToken.updateMany({ where: { id: owner.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
      if (consumed.count !== 1) {
        const current = await tx.customer.findUnique({ where: { id: owner.customerId }, select: { emailVerifiedAt: true } });
        return current?.emailVerifiedAt ? "already-verified" as const : "unavailable" as const;
      }
      await tx.customer.update({ where: { id: owner.customerId }, data: { emailVerifiedAt: now } });
      await tx.customerVerificationToken.updateMany({ where: { customerId: owner.customerId, usedAt: null }, data: { usedAt: now } });
      return "verified" as const;
    });

    if (redemption === "unavailable") {
      resultStatus = 409; outcome = "token_changed";
      return response({ error: "This verification link can no longer be used. Request a new link if your email is not verified.", code: "invalid" }, resultStatus, requestId);
    }
    resultStatus = 200; outcome = redemption;
    return response({ success: true, alreadyVerified: redemption === "already-verified", message: redemption === "already-verified" ? "This email address is already verified. You can sign in." : "Email Verified Successfully. You can now sign in." }, resultStatus, requestId);
  } catch (error) {
    const errorCode = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : undefined;
    console.error("customer_verification_request_failed", { requestId, outcome, errorName: error instanceof Error ? error.name : "UnknownError", ...(errorCode ? { errorCode } : {}) });
    resultStatus = 503;
    outcome = "service_unavailable";
    return response({ error: "Verification is temporarily unavailable. Please try again.", code: "unavailable" }, resultStatus, requestId);
  } finally {
    console.info("customer_verification_request_completed", { requestId, status: resultStatus, outcome, durationMs: Date.now() - startedAt });
  }
}
