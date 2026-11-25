import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { validOrigin } from "@/lib/admin/origin";
import { readBoundedBody } from "@/lib/payments/request-guard-stream";
import { assertManagedMediaAvailable, queueReleasedMedia } from "@/lib/admin/global-media-references";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateInput = z.object({
  title: z.string().trim().min(1).max(191).optional(),
  enabled: z.boolean().optional(),
  sourceType: z.enum(["upload", "url"]).optional(),
  videoUrl: z.string().max(2000).nullable().optional(),
  mobileUrl: z.string().max(2000).nullable().optional(),
  videoFile: z.string().max(2000).nullable().optional(),
  posterImage: z.string().max(2000).nullable().optional(),
  fallbackMs: z.number().int().min(5000).max(120000).optional(),
}).strict();

function validMedia(value: string | null | undefined) {
  if (!value) return true;

  if (value.startsWith("/") && !value.startsWith("//")) {
    return !value.includes("\\") && !value.includes("..");
  }

  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      (
        ["youtube.com", "www.youtube.com", "m.youtube.com",
         "youtu.be", "www.youtu.be",
         "youtube-nocookie.com", "www.youtube-nocookie.com",
         "instagram.com", "www.instagram.com",
         "pinterest.com", "www.pinterest.com", "pin.it"].includes(url.hostname)
        || /\.(mp4|webm)$/i.test(url.pathname)
      );
  } catch {
    return false;
  }
}

type Context = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, context: Context) {
  if (!await getCurrentAdmin()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!validOrigin(req)) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  const { id } = await context.params;

  if (!id || id.length > 191) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
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
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateInput.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid update" }, { status: 400 });
  }

  const data = parsed.data;

  if (
    !validMedia(data.videoUrl) ||
    !validMedia(data.mobileUrl) ||
    !validMedia(data.videoFile) ||
    !validMedia(data.posterImage)
  ) {
    return NextResponse.json({ error: "Invalid media URL" }, { status: 400 });
  }

  try {
    const story = await prisma.$transaction(async tx => {
    const existing = await tx.videoStory.findUnique({ where: { id } });
    if (!existing) return null;
    const sourceType = data.sourceType ?? existing.sourceType;
    const videoUrl = data.videoUrl !== undefined ? data.videoUrl : existing.videoUrl;
    const videoFile = data.videoFile !== undefined ? data.videoFile : existing.videoFile;

    if (
      (sourceType === "url" && !videoUrl) ||
      (sourceType === "upload" && !videoFile)
    ) {
      throw new Error("STORY_SOURCE_REQUIRED");
    }
    await assertManagedMediaAvailable(tx, data);
    const updated = await tx.videoStory.update({ where: { id }, data });
    await queueReleasedMedia(tx, existing, updated);
    return updated;
    });
    if (!story) return NextResponse.json({ error: "Story not found" }, { status: 404 });

    return NextResponse.json({ success: true, story });
  } catch (error) {
    if (error instanceof Error && error.message === "STORY_SOURCE_REQUIRED") return NextResponse.json({ error: "A valid video source is required" }, { status: 400 });
    return NextResponse.json(
      { error: "Unable to update video story" },
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

  if (!id || id.length > 191) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
    const deleted = await prisma.$transaction(async tx => {
      const existing = await tx.videoStory.findUnique({ where: { id } });
      if (!existing) return false;
      await tx.videoStory.delete({ where: { id } });
      await queueReleasedMedia(tx, existing, null);
      return true;
    });
    if (!deleted) return NextResponse.json({ error: "Story not found" }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Unable to delete video story" },
      { status: 500 }
    );
  }
}
