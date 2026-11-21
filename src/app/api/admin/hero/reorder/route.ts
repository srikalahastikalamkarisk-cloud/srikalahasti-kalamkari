import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { validOrigin } from "@/lib/admin/origin";
import { readBoundedBody } from "@/lib/payments/request-guard-stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reorderInput = z.object({
  ids: z.array(z.string().min(1).max(191))
    .min(1)
    .max(100),
}).strict();

export async function PATCH(req: NextRequest) {
  if (!await getCurrentAdmin()) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  if (!validOrigin(req)) {
    return NextResponse.json(
      { error: "Invalid origin" },
      { status: 403 }
    );
  }

  if (!req.body) {
    return NextResponse.json(
      { error: "Missing request body" },
      { status: 400 }
    );
  }

  const bounded = await readBoundedBody(
    req.body,
    16 * 1024
  );

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

  const parsed = reorderInput.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid slide order" },
      { status: 400 }
    );
  }

  const ids = parsed.data.ids;

  if (new Set(ids).size !== ids.length) {
    return NextResponse.json(
      { error: "Duplicate slide IDs" },
      { status: 400 }
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.heroSlide.findMany({
        select: { id: true },
      });

      const existingIds = new Set(
        existing.map((slide) => slide.id)
      );

      if (
        existing.length !== ids.length ||
        ids.some((id) => !existingIds.has(id))
      ) {
        throw new Error("SLIDE_ORDER_MISMATCH");
      }

      for (let index = 0; index < ids.length; index++) {
        await tx.heroSlide.update({
          where: { id: ids[index] },
          data: { sortOrder: index },
        });
      }
    });

    return NextResponse.json({
      success: true,
      order: ids,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "SLIDE_ORDER_MISMATCH"
    ) {
      return NextResponse.json(
        {
          error: "Slides changed. Refresh and try again.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Unable to reorder slides" },
      { status: 500 }
    );
  }
}
