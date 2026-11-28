import "server-only";
import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export function maskIndianPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 ? `+91 ••••••${digits.slice(-4)}` : null;
}

export async function recordOtpActivity(phone: string | null, outcome: "success" | "failure" | "rate_limited", category: string | null = null) {
  try {
    const now = new Date();
    await prisma.customerOtpActivity.create({ data: { id: randomUUID(), maskedPhone: phone ? maskIndianPhone(phone) : null, outcome, category: category?.slice(0, 40) ?? null } });
    await prisma.customerOtpActivity.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 30 * 86400_000) } } });
  } catch { /* Authentication decisions must not depend on analytics storage. */ }
}

export async function customerOtpEnabled() {
  if (process.env.CUSTOMER_OTP_ENABLED !== "true" || !process.env.MSG91_AUTH_KEY?.trim() || !process.env.MSG91_WIDGET_ID?.trim() || (process.env.NODE_ENV === "production" && !trustedProxyConfigured())) return false;
  try {
    const settings = await prisma.storeSettings.findUnique({ where: { id: "primary" }, select: { customerOtpEnabled: true } });
    return settings?.customerOtpEnabled === true;
  } catch { return false; }
}

export async function customerAuthMethods() {
  try {
    const settings = await prisma.storeSettings.findUnique({ where: { id: "primary" }, select: { customerOtpEnabled: true, customerEmailLoginEnabled: true } });
    return {
      mobileOtp: settings?.customerOtpEnabled === true && process.env.CUSTOMER_OTP_ENABLED === "true" && Boolean(process.env.MSG91_AUTH_KEY?.trim() && process.env.MSG91_WIDGET_ID?.trim()) && !(process.env.NODE_ENV === "production" && !trustedProxyConfigured()),
      emailPassword: settings?.customerEmailLoginEnabled !== false,
    };
  } catch {
    return { mobileOtp: false, emailPassword: true };
  }
}

export function trustedProxyConfigured() {
  const header = process.env.TRUSTED_PROXY_IP_HEADER?.trim().toLowerCase();
  return header === "x-real-ip" || header === "x-forwarded-for";
}

/** Set only when the hosting proxy is configured to overwrite the named header. */
export function trustedClientIp(request: NextRequest): string | null {
  const header = process.env.TRUSTED_PROXY_IP_HEADER?.trim().toLowerCase();
  if (header !== "x-real-ip" && header !== "x-forwarded-for") return null;
  const raw = request.headers.get(header);
  if (!raw || raw.length > 256) return null;
  const value = header === "x-forwarded-for" ? raw.split(",").at(-1)?.trim() : raw.trim();
  return value && isIP(value) ? value : null;
}
