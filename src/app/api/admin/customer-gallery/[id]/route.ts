import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { validOrigin } from "@/lib/admin/origin";
import { readBoundedBody } from "@/lib/payments/request-guard-stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ id: string }>;
};

const updateInput = z.object({
  caption: z.string().trim().max(255).nullable().optional(),
  altText: z.string().trim().max(255).nullable().optional(),
  isApproved: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
}).strict().refine(
  data => Object.keys(data).length > 0,
  "At least one field is required"
);

export async function PATCH(req: NextRequest, context: Context) {
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

  const parsed = updateInput.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid gallery update", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { id } = await context.params;

  try {
    const existing = await prisma.customerGallery.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Gallery photo not found" },
        { status: 404 }
      );
    }

    const photo = await prisma.customerGallery.update({
      where: { id },
      data: parsed.data,
    });

    revalidatePath("/");

    return NextResponse.json({ success: true, photo });
  } catch {
    return NextResponse.json(
      { error: "Unable to update gallery photo" },
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

  if (!req.body) {
    return NextResponse.json(
      { error: "Confirmation required" },
      { status: 400 }
    );
  }

  const bounded = await readBoundedBody(req.body, 1024);

  if (!bounded.ok) {
    return NextResponse.json(
      { error: "Invalid confirmation request" },
      { status: bounded.status }
    );
  }

  let confirmation: unknown;

  try {
    confirmation = JSON.parse(
      new TextDecoder().decode(bounded.body)
    );
  } catch {
    return NextResponse.json(
      { error: "Invalid confirmation" },
      { status: 400 }
    );
  }

  if (
    !confirmation ||
    typeof confirmation !== "object" ||
    !("confirm" in confirmation) ||
    confirmation.confirm !== true
  ) {
    return NextResponse.json(
      { error: "Explicit confirmation required" },
      { status: 400 }
    );
  }

  const { id } = await context.params;

  try {
    const existing = await prisma.customerGallery.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Gallery photo not found" },
        { status: 404 }
      );
    }

    await prisma.customerGallery.delete({ where: { id } });

    revalidatePath("/");

    return NextResponse.json({
      success: true,
      message: "Removed from customer gallery. Media file retained.",
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to remove gallery photo" },
      { status: 500 }
    );
  }
}
