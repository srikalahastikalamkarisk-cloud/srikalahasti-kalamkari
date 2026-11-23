import { hash } from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ADMIN_COOKIE } from "@/lib/admin-auth";
import { checkAdminPasswordResetLimit } from "@/lib/admin/password-reset-rate-limit";
import { hashAdminResetToken, isAdminResetTokenFormatValid, isStrongAdminPassword } from "@/lib/admin/password-reset-core";

export const runtime = "nodejs";
const bodySchema = z.object({ token: z.string().max(64), password: z.string().max(1024) });

function clientAddress(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 128) || "unknown";
}

export async function POST(request: NextRequest) {
  try {
    if (!request.headers.get("content-type")?.includes("application/json") || request.headers.get("origin") !== (
      process.env.APP_BASE_URL
        ? new URL(process.env.APP_BASE_URL).origin
        : request.nextUrl.origin
    )) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const raw = await request.text();
    if (raw.length > 4096) return NextResponse.json({ error: "Invalid or expired reset link." }, { status: 400 });
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid or expired reset link." }, { status: 400 }); }
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success || !isAdminResetTokenFormatValid(parsed.data?.token ?? "") || !isStrongAdminPassword(parsed.data?.password ?? "")) {
      return NextResponse.json({ error: "Invalid reset link or password does not meet the requirements." }, { status: 400 });
    }
    const { token, password } = parsed.data;
    const limited = await checkAdminPasswordResetLimit("redeem", null, clientAddress(request));
    if (!limited) return NextResponse.json({ error: "Please wait before trying again." }, { status: 429 });

    const tokenHash = hashAdminResetToken(token);
    const passwordHash = await hash(password, 12);
    const now = new Date();
    const tokenOwner = await prisma.adminPasswordResetToken.findFirst({
      where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
      select: { adminId: true },
    });
    if (!tokenOwner) throw new Error("INVALID_RESET_TOKEN");
    await prisma.$transaction(async tx => {
      const admins = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM AdminUser WHERE id = ${tokenOwner.adminId} AND isActive = 1 FOR UPDATE
      `;
      if (!admins[0]) throw new Error("INVALID_RESET_TOKEN");
      const rows = await tx.$queryRaw<Array<{ id: string; adminId: string }>>`
        SELECT id, adminId FROM AdminPasswordResetToken
        WHERE tokenHash = ${tokenHash} AND adminId = ${tokenOwner.adminId} AND usedAt IS NULL AND expiresAt > ${now}
        LIMIT 1 FOR UPDATE
      `;
      const reset = rows[0];
      if (!reset) throw new Error("INVALID_RESET_TOKEN");
      const consumed = await tx.adminPasswordResetToken.updateMany({
        where: { id: reset.id, tokenHash, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) throw new Error("INVALID_RESET_TOKEN");
      await tx.adminUser.update({
        where: { id: reset.adminId, isActive: true },
        data: { passwordHash, sessionVersion: { increment: 1 } },
      });
      await tx.adminPasswordResetToken.updateMany({
        where: { adminId: reset.adminId, usedAt: null },
        data: { usedAt: now },
      });
    });

    const response = NextResponse.json({ success: true, message: "Your password has been reset. Please sign in again." });
    response.cookies.set(ADMIN_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 0 });
    return response;
  } catch {
    return NextResponse.json({ error: "Invalid or expired reset link." }, { status: 400 });
  }
}
