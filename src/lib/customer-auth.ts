import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { CUSTOMER_COOKIE, CUSTOMER_SESSION_TTL_SECONDS } from "@/lib/customer-auth-core";

function key() {
  const secret = process.env.CUSTOMER_SESSION_SECRET || process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("Customer session secret is not configured");
  return new TextEncoder().encode(secret);
}

export async function createCustomerSession(id: string, version: number) {
  return new SignJWT({ role: "customer", sv: version })
    .setProtectedHeader({ alg: "HS256" }).setSubject(id).setIssuedAt()
    .setExpirationTime(`${CUSTOMER_SESSION_TTL_SECONDS}s`).sign(key());
}

export async function getCurrentCustomer() {
  const token = (await cookies()).get(CUSTOMER_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    if (payload.role !== "customer" || !payload.sub || !Number.isSafeInteger(payload.sv)) return null;
    const customer = await prisma.customer.findUnique({
      where: { id: payload.sub },
      select: { id: true, name: true, email: true, phone: true, normalizedPhone: true, mobileVerifiedAt: true, emailVerifiedAt: true, sessionVersion: true },
    });
    if (!customer || customer.sessionVersion !== payload.sv) return null;
    return customer;
  } catch { return null; }
}
