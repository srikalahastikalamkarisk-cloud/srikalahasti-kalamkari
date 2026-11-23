import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { isAdminSessionVersionValid } from "@/lib/admin/password-reset-validation";

export const ADMIN_COOKIE = "sk_admin_session";

function sessionKey() {
  const secret = process.env.ADMIN_SESSION_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("ADMIN_SESSION_SECRET is not configured");
  }

  return new TextEncoder().encode(secret);
}

export async function createAdminSession(adminId: string, sessionVersion = 0) {
  return new SignJWT({ role: "admin", sv: sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(adminId)
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(sessionKey());
}

export async function getCurrentAdmin() {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;

  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, sessionKey(), {
      algorithms: ["HS256"],
    });

    if (payload.role !== "admin" || !payload.sub) return null;

    const admin = await prisma.adminUser.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        sessionVersion: true,
      },
    });

    if (!admin?.isActive || !isAdminSessionVersionValid(payload.sv, admin.sessionVersion)) return null;
    const { sessionVersion: _sessionVersion, ...currentAdmin } = admin;
    return currentAdmin;
  } catch {
    return null;
  }
}
