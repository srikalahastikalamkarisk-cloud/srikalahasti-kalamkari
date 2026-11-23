import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkAdminPasswordResetLimit } from "@/lib/admin/password-reset-rate-limit";
import { createAdminResetToken, ADMIN_RESET_TOKEN_TTL_MS } from "@/lib/admin/password-reset-core";
import { getResetEmailConfig, sendAdminPasswordResetEmail } from "@/lib/admin/password-reset-email";

export const runtime = "nodejs";
const emailSchema = z.object({ email: z.email().max(254) });
const genericResponse = () => NextResponse.json({ message: "If an administrator account matches that email, a reset link will be sent shortly." });

function clientAddress(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 128) || "unknown";
}

function safeDiagnostic(stage: string, error?: unknown) {
  const rawCode = error && typeof error === "object" && "code" in error
    ? (error as { code?: unknown }).code
    : undefined;
  const allowedCodes = new Set(["EAUTH", "ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS", "EENVELOPE", "P1000", "P1001", "P2021"]);
  const code = typeof rawCode === "string" && allowedCodes.has(rawCode) ? rawCode : undefined;
  console.error("admin_password_reset_diagnostic", { stage, ...(code ? { code } : {}) });
}

export async function POST(request: NextRequest) {
  let stage = "request_validation";
  try {
    if (!request.headers.get("content-type")?.includes("application/json") || request.headers.get("origin") !== (
      process.env.APP_BASE_URL
        ? new URL(process.env.APP_BASE_URL).origin
        : request.nextUrl.origin
    )) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const raw = await request.text();
    if (raw.length > 2048) return genericResponse();
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return genericResponse(); }
    const parsed = emailSchema.safeParse(body);
    if (!parsed.success) return genericResponse();

    const email = parsed.data.email.trim().toLowerCase();
    stage = "rate_limit";
    const allowed = await checkAdminPasswordResetLimit("request", email, clientAddress(request));
    if (!allowed) {
      safeDiagnostic("rate_limit_denied_or_unavailable");
      return genericResponse();
    }

    stage = "email_configuration";
    const emailConfig = getResetEmailConfig();
    if (!emailConfig) {
      safeDiagnostic("email_configuration_unavailable");
      return genericResponse();
    }

    stage = "account_lookup";
    const admin = await prisma.adminUser.findUnique({ where: { email }, select: { id: true, email: true, isActive: true } });
    if (!admin?.isActive) return genericResponse();

    stage = "token_storage";
    const { token, tokenHash } = createAdminResetToken();
    const expiresAt = new Date(Date.now() + ADMIN_RESET_TOKEN_TTL_MS);
    await prisma.$transaction(async tx => {
      await tx.adminPasswordResetToken.updateMany({
        where: { adminId: admin.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.adminPasswordResetToken.create({ data: { adminId: admin.id, tokenHash, expiresAt } });
    });

    stage = "email_callback_registration";
    after(async () => {
      console.info("admin_password_reset_email_delivery_started");
      try {
        await sendAdminPasswordResetEmail(admin.email, token, {}, emailConfig);
        console.info("admin_password_reset_email_delivery_succeeded");
      } catch (error) {
        safeDiagnostic("email_delivery_failed", error);
        await prisma.adminPasswordResetToken.updateMany({ where: { tokenHash, usedAt: null }, data: { usedAt: new Date() } }).catch(() => undefined);
      }
    });
    return genericResponse();
  } catch (error) {
    safeDiagnostic(stage, error);
    return genericResponse();
  }
}
