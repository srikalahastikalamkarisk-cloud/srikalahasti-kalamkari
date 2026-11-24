import { NextRequest, NextResponse } from "next/server";
import { isValidRequestOrigin } from "@/lib/request-origin";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { ORIGINAL_THEME_ID, STORE_THEME_BY_ID } from "@/lib/store-themes";
import { readBoundedBody } from "@/lib/payments/request-guard-stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const previewCookie = "sk_theme_private_preview";
const themeSchema = z.object({ themeId: z.string().max(100) }).strict();

async function readTheme(request: NextRequest) {
  if (!isValidRequestOrigin(request))
    return { error: "Invalid origin", status: 403 } as const;
  if (!request.body) return { error: "Missing request body", status: 400 } as const;
  if (Number(request.headers.get("content-length") || "0") > 1024)
    return { error: "Request too large", status: 413 } as const;
  const bounded = await readBoundedBody(request.body, 1024);
  if (!bounded.ok) return { error: "Invalid request size", status: bounded.status } as const;
  try {
    const parsed = themeSchema.safeParse(JSON.parse(new TextDecoder().decode(bounded.body)));
    if (!parsed.success || !STORE_THEME_BY_ID.has(parsed.data.themeId))
      return { error: "Unknown theme", status: 400 } as const;
    return { themeId: parsed.data.themeId } as const;
  } catch { return { error: "Invalid JSON", status: 400 } as const; }
}

export async function GET() {
  if (!await getCurrentAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const settings = await prisma.storeSettings.findUnique({ where: { id: "primary" }, select: { themeId: true } });
    return NextResponse.json({ themeId: settings?.themeId || ORIGINAL_THEME_ID }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Unable to read theme" }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await readTheme(request);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  const response = NextResponse.json({ success: true, previewThemeId: result.themeId });
  response.cookies.set(previewCookie, result.themeId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 3600 });
  return response;
}

export async function DELETE(request: NextRequest) {
  if (!await getCurrentAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isValidRequestOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const response = NextResponse.json({ success: true });
  response.cookies.set(previewCookie, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  return response;
}

export async function PUT(request: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await readTheme(request);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  try {
    await prisma.$transaction(async tx => {
      const previous = await tx.storeSettings.findUnique({ where: { id: "primary" }, select: { themeId: true } });
      await tx.storeSettings.upsert({
        where: { id: "primary" },
        create: { id: "primary", themeId: result.themeId },
        update: { themeId: result.themeId },
      });
      await tx.storeThemeHistory.create({ data: {
        themeId: result.themeId,
        previousId: previous?.themeId || ORIGINAL_THEME_ID,
        action: result.themeId === ORIGINAL_THEME_ID ? "RESTORE" : "PUBLISH",
        adminId: admin.id,
      } });
    });
    const response = NextResponse.json({ success: true, themeId: result.themeId });
    response.cookies.set(previewCookie, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
    return response;
  } catch (error) {
    console.error("Theme publish failed", error);
    return NextResponse.json({ error: "Unable to publish theme" }, { status: 500 });
  }
}
