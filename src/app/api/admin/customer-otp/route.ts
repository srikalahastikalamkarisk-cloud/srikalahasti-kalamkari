import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { isValidRequestOrigin } from "@/lib/request-origin";
import { customerAuthMethods, trustedProxyConfigured } from "@/lib/customer-otp";
import { getMsg91OtpAnalytics } from "@/lib/customer-otp-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!await getCurrentAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const methods = await customerAuthMethods();
  const [settings, activity] = await Promise.all([
    prisma.storeSettings.findUnique({ where: { id: "primary" }, select: { customerOtpEnabled: true, customerEmailLoginEnabled: true } }),
    prisma.customerOtpActivity.findMany({ orderBy: { createdAt: "desc" }, take: 20, select: { maskedPhone: true, outcome: true, category: true, createdAt: true } }),
  ]);
  const since = new Date(Date.now() - 30 * 86400_000);
  const counts = await prisma.customerOtpActivity.groupBy({ by: ["outcome"], where: { createdAt: { gte: since } }, _count: { _all: true } });
  const count = (outcome: string) => counts.find(row => row.outcome === outcome)?._count._all ?? 0;
  const isoDate = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  const today = isoDate(new Date());
  const monthStart = `${today.slice(0, 7)}-01`;
  const monthLength = (a: string, b: string) => Math.floor((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000) + 1;
  let providerUsage: Record<string, unknown> = { available: false, walletBalance: null, today: null, month: null };
  if (process.env.MSG91_AUTH_KEY?.trim()) {
    try {
      const end = new Date();
      const todayReport = await getMsg91OtpAnalytics(today, today, process.env.MSG91_AUTH_KEY);
      const monthStartClamped = monthLength(monthStart, today) > 31 ? isoDate(new Date(end.getTime() - 30 * 86400000)) : monthStart;
      const monthReport = await getMsg91OtpAnalytics(monthStartClamped, today, process.env.MSG91_AUTH_KEY);
      const summary = (report: Record<string, unknown>) => {
        const totals = typeof report.total === "object" && report.total !== null ? report.total as Record<string, unknown> : {};
        return { sent: typeof totals.sms === "number" ? totals.sms : null, failed: null, charges: null };
      };
      const todaySummary = summary(todayReport);
      const monthSummary = summary(monthReport);
      if (todaySummary.sent === null && monthSummary.sent === null) throw new Error("MSG91 widget analytics fields unavailable");
      providerUsage = { available: true, walletBalance: null, today: todaySummary, month: monthSummary };
    } catch { providerUsage = { available: false, walletBalance: null, today: null, month: null }; }
  }
  return NextResponse.json({
    enabled: settings?.customerOtpEnabled ?? false,
    emailEnabled: settings?.customerEmailLoginEnabled ?? true,
    effective: methods.mobileOtp,
    methods,
    providerConfigured: Boolean(process.env.MSG91_AUTH_KEY?.trim()),
    widgetConfigured: Boolean(process.env.MSG91_WIDGET_ID?.trim()),
    channel: "SMS",
    providerUsage,
    estimatedCostPerOtp: (() => {
      const rate = Number(process.env.MSG91_ESTIMATED_SMS_COST || "0.25");
      return Number.isFinite(rate) && rate > 0 && rate <= 100 ? rate : 0.25;
    })(),
    counts: { success: count("success"), failure: count("failure"), rateLimited: count("rate_limited") },
    activity,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: NextRequest) {
  if (!await getCurrentAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isValidRequestOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const parsed = z.object({ enabled: z.boolean().optional(), emailEnabled: z.boolean().optional() }).refine(value => value.enabled !== undefined || value.emailEnabled !== undefined).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid setting." }, { status: 400 });
  const current = await prisma.storeSettings.findUnique({ where: { id: "primary" }, select: { customerOtpEnabled: true, customerEmailLoginEnabled: true } });
  const next = { customerOtpEnabled: parsed.data.enabled ?? current?.customerOtpEnabled ?? false, customerEmailLoginEnabled: parsed.data.emailEnabled ?? current?.customerEmailLoginEnabled ?? true };
  if (!next.customerOtpEnabled && !next.customerEmailLoginEnabled) return NextResponse.json({ error: "At least one customer sign-in method must remain enabled." }, { status: 400 });
  const otpReady = next.customerOtpEnabled && process.env.CUSTOMER_OTP_ENABLED === "true" && Boolean(process.env.MSG91_AUTH_KEY?.trim() && process.env.MSG91_WIDGET_ID?.trim()) && !(process.env.NODE_ENV === "production" && !trustedProxyConfigured());
  if (!otpReady && !next.customerEmailLoginEnabled) return NextResponse.json({ error: "Enable and configure another sign-in method before disabling this one." }, { status: 400 });
  const settings = await prisma.storeSettings.upsert({ where: { id: "primary" }, create: { id: "primary", ...next }, update: next });
  return NextResponse.json({ enabled: settings.customerOtpEnabled, emailEnabled: settings.customerEmailLoginEnabled, methods: await customerAuthMethods() }, { headers: { "Cache-Control": "no-store" } });
}
