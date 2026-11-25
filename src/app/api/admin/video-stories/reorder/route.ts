import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { validOrigin } from "@/lib/admin/origin";
import { readBoundedBody } from "@/lib/payments/request-guard-stream";
import { lockMediaMutation } from "@/lib/admin/media-mutation-lock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reorderInput = z.object({
  ids: z.array(z.string().min(1).max(191)).max(200),
}).strict();

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
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = reorderInput.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid order" }, { status: 400 });
  }

  const ids = parsed.data.ids;

  if (new Set(ids).size !== ids.length) {
    return NextResponse.json(
      { error: "Duplicate story IDs" },
      { status: 400 }
    );
  }

  try {
    await prisma.$transaction(async tx => {
      await lockMediaMutation(tx);
      const existing = await tx.videoStory.findMany({
        select: { id: true },
      });

      const existingIds = new Set(existing.map(story => story.id));

      if (
        existing.length !== ids.length ||
        ids.some(id => !existingIds.has(id))
      ) {
        throw new Error("INVALID_STORY_ORDER");
      }

      for (let index = 0; index < ids.length; index++) {
        await tx.videoStory.update({
          where: { id: ids[index] },
          data: { sortOrder: index },
        });
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "INVALID_STORY_ORDER"
    ) {
      return NextResponse.json(
        { error: "Story list changed. Refresh and try again." },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Unable to reorder video stories" },
      { status: 500 }
    );
  }
}
