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
  customerName: z.string().trim().min(2).max(120).optional(),
  rating: z.number().int().min(1).max(5).optional(),
  reviewText: z.string().trim().min(10).max(3000).optional(),
  isVerified: z.boolean().optional(),
  isApproved: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
}).strict().refine(
  data => Object.keys(data).length > 0,
  "At least one field is required"
);

async function parseBody(req: NextRequest, maxBytes: number) {
  if (!req.body) return { ok: false as const, status: 400, error: "Missing body" };

  const bounded = await readBoundedBody(req.body, maxBytes);

  if (!bounded.ok) {
    return { ok: false as const, status: bounded.status, error: "Invalid or oversized request" };
  }

  try {
    return {
      ok: true as const,
      value: JSON.parse(new TextDecoder().decode(bounded.body)) as unknown,
    };
  } catch {
    return { ok: false as const, status: 400, error: "Invalid JSON" };
  }
}

export async function PATCH(req: NextRequest, context: Context) {
  if (!await getCurrentAdmin()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!validOrigin(req)) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  const body = await parseBody(req, 16 * 1024);

  if (!body.ok) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }

  const parsed = updateInput.safeParse(body.value);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid review update", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { id } = await context.params;

  try {
    const existing = await prisma.customerReview.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Customer review not found" },
        { status: 404 }
      );
    }

    const review = await prisma.customerReview.update({
      where: { id },
      data: parsed.data,
    });

    revalidatePath("/");

    return NextResponse.json({ success: true, review });
  } catch {
    return NextResponse.json(
      { error: "Unable to update customer review" },
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

  const body = await parseBody(req, 1024);

  if (!body.ok) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }

  const confirmation = z.object({
    confirm: z.literal(true),
  }).strict().safeParse(body.value);

  if (!confirmation.success) {
    return NextResponse.json(
      { error: "Explicit delete confirmation required" },
      { status: 400 }
    );
  }

  const { id } = await context.params;

  try {
    const existing = await prisma.customerReview.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Customer review not found" },
        { status: 404 }
      );
    }

    await prisma.customerReview.delete({ where: { id } });

    revalidatePath("/");

    return NextResponse.json({
      success: true,
      message: "Customer review permanently removed.",
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to delete customer review" },
      { status: 500 }
    );
  }
}
