import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { validOrigin } from "@/lib/admin/origin";
import { readBoundedBody } from "@/lib/payments/request-guard-stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galleryInput = z.object({
  imageUrl: z.string().regex(
    /^\/api\/media\/products\/[a-f0-9-]{36}\.(jpg|png|webp)$/,
    "Choose an image from Media Library"
  ),
  caption: z.string().trim().max(255).nullable().optional(),
  altText: z.string().trim().max(255).nullable().optional(),
  isApproved: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(100000).optional(),
}).strict();

export async function GET() {
  if (!await getCurrentAdmin()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const photos = await prisma.customerGallery.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });

    return NextResponse.json(
      { photos },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to load customer gallery" },
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

  const parsed = galleryInput.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid gallery data", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const storageKey = data.imageUrl.split("/").pop()!;

  try {
    const asset = await prisma.mediaAsset.findFirst({
      where: { storageKey, deletionPending: false },
      select: { id: true },
    });

    if (!asset) {
      return NextResponse.json(
        { error: "Image not found in Media Library" },
        { status: 400 }
      );
    }

    const last = await prisma.customerGallery.findFirst({
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    const photo = await prisma.customerGallery.create({
      data: {
        imageUrl: data.imageUrl,
        caption: data.caption ?? null,
        altText: data.altText ?? null,
        isApproved: data.isApproved,
        sortOrder: data.sortOrder ?? (last?.sortOrder ?? -1) + 1,
      },
    });

    return NextResponse.json(
      { success: true, photo },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to create gallery photo" },
      { status: 500 }
    );
  }
}
