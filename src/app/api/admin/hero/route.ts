import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { validOrigin } from "@/lib/admin/origin";
import { readBoundedBody } from "@/lib/payments/request-guard-stream";
import { validateSlideMedia } from "@/lib/hero-media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const slideInput = z.object({
  enabled: z.boolean().default(true),
  mediaType: z.enum(["image", "video", "youtube", "instagram", "pinterest", "direct"]).default("image"),
  desktopImage: z.string().max(2000).default(""),
  mobileImage: z.string().max(2000).default(""),
  desktopVideo: z.string().max(2000).nullable().optional(),
  mobileVideo: z.string().max(2000).nullable().optional(),
  videoUrl: z.string().max(2000).nullable().optional(),
  desktopSourceUrl: z.string().max(2000).nullable().optional(),
  mobileSourceUrl: z.string().max(2000).nullable().optional(),
  posterImage: z.string().max(2000).nullable().optional(),
  eyebrow: z.string().max(191).default(""),
  title: z.string().trim().min(1).max(191),
  highlight: z.string().max(191).default(""),
  description: z.string().max(3000).default(""),
  primaryLabel: z.string().max(191).default(""),
  primaryHref: z.string().max(500).default(""),
  secondaryLabel: z.string().max(191).default(""),
  secondaryHref: z.string().max(500).default(""),
  duration: z.number().int().min(1000).max(30000).default(5000),
  videoFallbackMs: z.number().int().min(5000).max(120000).default(30000),
  soundControlsEnabled: z.boolean().default(true),
  initialMuted: z.boolean().default(true),
  transitionMs: z.number().int().min(100).max(5000).default(1100),
  animation: z.enum(["fade", "zoom", "slide"]).default("fade"),
  textPosition: z.enum(["left", "center", "right"]).default("left"),
  overlayOpacity: z.number().min(0).max(1).default(0.48),
}).strict();

function validLink(value: string) {
  if (!value) return true;
  return value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !value.includes("..");
}

export async function GET() {
  if (!await getCurrentAdmin()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const slides = await prisma.heroSlide.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });

    return NextResponse.json(
      { slides },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const lowerMessage = message.toLowerCase();
    const missingTable = lowerMessage.includes("heroslide") &&
      (lowerMessage.includes("p2021") || lowerMessage.includes("1146") || lowerMessage.includes("does not exist") || lowerMessage.includes("doesn't exist"));
    return NextResponse.json(
      { error: missingTable ? "Hero Slider migration is pending for this database." : "Unable to load hero slides" },
      { status: missingTable ? 503 : 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  if (!await getCurrentAdmin()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!validOrigin(req)) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  if (!req.body) {
    return NextResponse.json({ error: "Missing body" }, { status: 400 });
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
    body = JSON.parse(new TextDecoder().decode(bounded.body));
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = slideInput.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid hero slide", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const data = parsed.data;

  const mediaError = validateSlideMedia(data);
  if (mediaError) return NextResponse.json({ error: mediaError }, { status: 400 });

  if (!validLink(data.primaryHref) || !validLink(data.secondaryHref)) {
    return NextResponse.json(
      { error: "Invalid button link" },
      { status: 400 }
    );
  }

  try {
    const last = await prisma.heroSlide.findFirst({
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    const slide = await prisma.heroSlide.create({
      data: {
        ...data,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    });

    return NextResponse.json(
      { success: true, slide },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to create hero slide" },
      { status: 500 }
    );
  }
}
