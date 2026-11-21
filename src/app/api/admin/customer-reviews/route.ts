import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { validOrigin } from "@/lib/admin/origin";
import { readBoundedBody } from "@/lib/payments/request-guard-stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reviewInput = z.object({
  customerName: z.string().trim().min(2).max(120),
  rating: z.number().int().min(1).max(5),
  reviewText: z.string().trim().min(10).max(3000),
  isVerified: z.boolean().default(false),
  isApproved: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(100000).optional(),
}).strict();

export async function GET() {
  if (!await getCurrentAdmin()) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const reviews = await prisma.customerReview.findMany({
      orderBy: [
        { sortOrder: "asc" },
        { createdAt: "desc" },
      ],
    });

    return NextResponse.json(
      { reviews },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to load customer reviews" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
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
      { error: "Missing body" },
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

  const parsed = reviewInput.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid customer review",
        issues: parsed.error.issues,
      },
      { status: 400 }
    );
  }

  const data = parsed.data;

  try {
    const last = await prisma.customerReview.findFirst({
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    const review = await prisma.customerReview.create({
      data: {
        customerName: data.customerName,
        rating: data.rating,
        reviewText: data.reviewText,
        isVerified: data.isVerified,
        isApproved: data.isApproved,
        sortOrder: data.sortOrder ?? (last?.sortOrder ?? -1) + 1,
      },
    });

    revalidatePath("/");

    return NextResponse.json(
      { success: true, review },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to create customer review" },
      { status: 500 }
    );
  }
}
