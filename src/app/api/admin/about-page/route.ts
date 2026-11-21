import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { validOrigin } from "@/lib/admin/origin";
import { readBoundedBody } from "@/lib/payments/request-guard-stream";
import { defaultAboutPageContent, validateAboutPageContent } from "@/lib/about-page-content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!await getCurrentAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const row = await prisma.aboutPageContent.findUnique({ where: { id: "primary" } });
    return NextResponse.json({ content: row && validateAboutPageContent(row.content) ? row.content : defaultAboutPageContent, configured: Boolean(row), migrationRequired: false }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("About Page admin GET failed", error);
    return NextResponse.json({ error: "Unable to load About Page settings" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  if (!await getCurrentAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!validOrigin(req)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  if (!req.body) return NextResponse.json({ error: "Missing request body" }, { status: 400 });
  const body = await readBoundedBody(req.body, 96 * 1024);
  if (!body.ok) return NextResponse.json({ error: "Invalid or oversized request" }, { status: body.status });
  let content: unknown;
  try { content = JSON.parse(new TextDecoder().decode(body.body)); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!validateAboutPageContent(content)) return NextResponse.json({ error: "Review About Page fields, links and media references." }, { status: 400 });

  const mediaUrls = [content.roots.image, ...content.process.steps.map(step => step.image), ...content.team.members.map(member => member.photo)].filter(url => url.startsWith("/api/media/products/"));
  for (const url of mediaUrls) {
    const storageKey = url.split("/").pop();
    if (!storageKey || !await prisma.mediaAsset.findFirst({ where: { storageKey, deletionPending: false, mimeType: { startsWith: "image/" } }, select: { id: true } })) {
      return NextResponse.json({ error: "One or more selected images are no longer available in Media Library." }, { status: 400 });
    }
  }
  try {
    await prisma.aboutPageContent.upsert({ where: { id: "primary" }, create: { id: "primary", content: content as Prisma.InputJsonValue }, update: { content: content as Prisma.InputJsonValue } });
    revalidatePath("/about");
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("About Page admin PUT failed", error);
    return NextResponse.json({ error: "Unable to save About Page settings" }, { status: 500 });
  }
}
