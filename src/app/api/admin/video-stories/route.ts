import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { validOrigin } from "@/lib/admin/origin";
import { readBoundedBody } from "@/lib/payments/request-guard-stream";
import { assertManagedMediaAvailable } from "@/lib/admin/global-media-references";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const storyInput = z.object({
  title: z.string().trim().min(1).max(191),
  enabled: z.boolean().default(true),
  sourceType: z.enum(["upload", "url"]),
  videoUrl: z.string().max(2000).nullable().optional(),
  mobileUrl: z.string().max(2000).nullable().optional(),
  videoFile: z.string().max(2000).nullable().optional(),
  posterImage: z.string().max(2000).nullable().optional(),
  fallbackMs: z.number().int().min(5000).max(120000).default(15000),
}).strict();

function validMedia(value: string | null | undefined) {
  if (!value) return true;

  if (value.startsWith("/") && !value.startsWith("//")) {
    return !value.includes("\\") && !value.includes("..");
  }

  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      ["youtube.com", "www.youtube.com", "m.youtube.com",
       "youtu.be", "www.youtu.be",
       "youtube-nocookie.com", "www.youtube-nocookie.com",
       "instagram.com", "www.instagram.com",
       "pinterest.com", "www.pinterest.com",
       "pin.it"].includes(url.hostname)
       || (url.protocol === "https:" &&
           /\.(mp4|webm)$/i.test(url.pathname));
  } catch {
    return false;
  }
}

export async function GET() {
  if (!await getCurrentAdmin()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const stories = await prisma.videoStory.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });

    return NextResponse.json(
      { stories },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to load video stories" },
      { status: 500 }
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
      { error: "Invalid request" },
      { status: bounded.status }
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(bounded.body));
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400 }
    );
  }

  const parsed = storyInput.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid story", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const data = parsed.data;

  if (
    !validMedia(data.videoUrl) ||
    !validMedia(data.mobileUrl) ||
    !validMedia(data.videoFile) ||
    !validMedia(data.posterImage)
  ) {
    return NextResponse.json(
      { error: "Invalid media URL" },
      { status: 400 }
    );
  }

  if (
    data.sourceType === "url" && !data.videoUrl ||
    data.sourceType === "upload" && !data.videoFile
  ) {
    return NextResponse.json(
      { error: "Video source is required" },
      { status: 400 }
    );
  }

  try {
    const last = await prisma.videoStory.findFirst({
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    const story = await prisma.$transaction(async tx => {
      await assertManagedMediaAvailable(tx, data);
      return tx.videoStory.create({ data: { ...data, sortOrder: (last?.sortOrder ?? -1) + 1 } });
    });

    return NextResponse.json(
      { success: true, story },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to create video story" },
      { status: 500 }
    );
  }
}
