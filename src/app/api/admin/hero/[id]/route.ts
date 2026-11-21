import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { validOrigin } from "@/lib/admin/origin";
import { readBoundedBody } from "@/lib/payments/request-guard-stream";
import { validateSlideMedia } from "@/lib/hero-media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateInput = z.object({
  enabled: z.boolean().optional(),
  mediaType: z.enum(["image", "video", "youtube", "instagram", "pinterest", "direct"]).optional(),
  desktopImage: z.string().max(2000).optional(),
  mobileImage: z.string().max(2000).optional(),
  desktopVideo: z.string().max(2000).nullable().optional(),
  mobileVideo: z.string().max(2000).nullable().optional(),
  videoUrl: z.string().max(2000).nullable().optional(),
  desktopSourceUrl: z.string().max(2000).nullable().optional(),
  mobileSourceUrl: z.string().max(2000).nullable().optional(),
  posterImage: z.string().max(2000).nullable().optional(),
  eyebrow: z.string().max(191).optional(),
  title: z.string().trim().min(1).max(191).optional(),
  highlight: z.string().max(191).optional(),
  description: z.string().max(3000).optional(),
  primaryLabel: z.string().max(191).optional(),
  primaryHref: z.string().max(500).optional(),
  secondaryLabel: z.string().max(191).optional(),
  secondaryHref: z.string().max(500).optional(),
  duration: z.number().int().min(1000).max(30000).optional(),
  videoFallbackMs: z.number().int().min(5000).max(120000).optional(),
  soundControlsEnabled: z.boolean().optional(),
  initialMuted: z.boolean().optional(),
  transitionMs: z.number().int().min(100).max(5000).optional(),
  animation: z.enum(["fade", "zoom", "slide"]).optional(),
  textPosition: z.enum(["left", "center", "right"]).optional(),
  overlayOpacity: z.number().min(0).max(1).optional(),
}).strict();

function validLink(value: string | undefined) {
  if (!value) return true;

  return value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !value.includes("..");
}

type Context = {
  params: Promise<{ id: string }>;
};

export async function PATCH(req: NextRequest, context: Context) {
  if (!await getCurrentAdmin()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!validOrigin(req)) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  const { id } = await context.params;

  // HERO_PATCH_BODY_LIMIT_V1
  if (!req.body) {
    return NextResponse.json(
      { error: "Missing request body" },
      { status: 400 }
    );
  }

  const bounded = await readBoundedBody(req.body, 16 * 1024);

  if (!bounded.ok) {
    return NextResponse.json(
      { error: "Invalid or oversized request" },
      { status: bounded.status }
    );
  }

  let body: unknown;

  try {
    body = JSON.parse(
      new TextDecoder().decode(bounded.body)
    );
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400 }
    );
  }
  const parsed = updateInput.safeParse(body);

  if (!parsed.success || Object.keys(parsed.data ?? {}).length === 0) {
    return NextResponse.json(
      { error: "Invalid slide update" },
      { status: 400 }
    );
  }

  const data = parsed.data;

  const existing = await prisma.heroSlide.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Slide not found" }, { status: 404 });
  const mediaError = validateSlideMedia({
    mediaType: (data.mediaType ?? existing.mediaType) as import("@/data/hero-slides").HeroMediaType,
    desktopImage: data.desktopImage ?? existing.desktopImage,
    mobileImage: data.mobileImage ?? existing.mobileImage,
    desktopVideo: data.desktopVideo ?? existing.desktopVideo,
    mobileVideo: data.mobileVideo ?? existing.mobileVideo,
    videoUrl: data.videoUrl ?? existing.videoUrl,
    desktopSourceUrl: data.desktopSourceUrl ?? existing.desktopSourceUrl,
    mobileSourceUrl: data.mobileSourceUrl ?? existing.mobileSourceUrl,
    posterImage: data.posterImage ?? existing.posterImage,
  });
  if (mediaError) return NextResponse.json({ error: mediaError }, { status: 400 });

  if (!validLink(data.primaryHref) || !validLink(data.secondaryHref)) {
    return NextResponse.json(
      { error: "Invalid button link" },
      { status: 400 }
    );
  }

  try {
    const result = await prisma.heroSlide.updateMany({
      where: { id },
      data,
    });

    if (result.count === 0) {
      return NextResponse.json(
        { error: "Slide not found" },
        { status: 404 }
      );
    }

    const slide = await prisma.heroSlide.findUnique({
      where: { id },
    });

    return NextResponse.json({ success: true, slide });
  } catch {
    return NextResponse.json(
      { error: "Unable to update slide" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, context: Context) {
  if (!await getCurrentAdmin()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!validOrigin(req)) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  const { id } = await context.params;

  try {
    const result = await prisma.heroSlide.deleteMany({
      where: { id },
    });

    if (result.count === 0) {
      return NextResponse.json(
        { error: "Slide not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Unable to delete slide" },
      { status: 500 }
    );
  }
}
