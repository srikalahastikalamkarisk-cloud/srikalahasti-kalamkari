import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/admin-auth";
import {
  moneyAmount,
  positiveMoney,
  validateCouponState,
} from "@/lib/admin/coupon-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  description: z.string().trim().max(500).nullable().optional(),
  discountType: z.enum(["PERCENTAGE", "FIXED"]).optional(),
  discountValue: positiveMoney.optional(),
  minimumOrderAmount: moneyAmount.optional(),
  maximumDiscountAmount: positiveMoney.nullable().optional(),
  usageLimit: z.number().int().positive().max(100000000).nullable().optional(),
  startsAt: z.iso.datetime({ offset: true }).nullable().optional(),
  expiresAt: z.iso.datetime({ offset: true }).nullable().optional(),
  isActive: z.boolean().optional(),
}).strict();

type Context = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, context: Context) {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (request.headers.get("origin") !== (
    process.env.APP_BASE_URL
      ? new URL(process.env.APP_BASE_URL).origin
      : request.nextUrl.origin
  )) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  const { id } = await context.params;

  if (!id || id.length > 191) {
    return NextResponse.json({ error: "Invalid coupon ID" }, { status: 400 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));

  if (!parsed.success || Object.keys(parsed.data ?? {}).length === 0) {
    return NextResponse.json({ error: "Invalid coupon update" }, { status: 400 });
  }

  try {
    const existing = await prisma.coupon.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json({ error: "Coupon not found" }, { status: 404 });
    }

    const data = parsed.data;

    const discountType = data.discountType ?? existing.discountType;
    const discountValue = data.discountValue ?? Number(existing.discountValue);
    const startsAt =
      data.startsAt === undefined
        ? existing.startsAt
        : data.startsAt === null ? null : new Date(data.startsAt);
    const expiresAt =
      data.expiresAt === undefined
        ? existing.expiresAt
        : data.expiresAt === null ? null : new Date(data.expiresAt);

    if (discountType === "PERCENTAGE" && discountValue > 100) {
      return NextResponse.json(
        { error: "Percentage cannot exceed 100" },
        { status: 400 }
      );
    }

    if (startsAt && expiresAt && expiresAt <= startsAt) {
      return NextResponse.json(
        { error: "Expiry must be after start date" },
        { status: 400 }
      );
    }

    const stateError = validateCouponState({
      discountType,
      discountValue,
      usageLimit:
        data.usageLimit === undefined
          ? existing.usageLimit
          : data.usageLimit,
      usedCount: existing.usedCount,
      startsAt,
      expiresAt,
      isActive: data.isActive ?? existing.isActive,
    });

    if (stateError) {
      return NextResponse.json(
        { error: stateError },
        { status: 400 }
      );
    }

    const coupon = await prisma.coupon.update({
      where: { id },
      data: {
        ...("description" in data ? { description: data.description } : {}),
        ...("discountType" in data ? { discountType: data.discountType } : {}),
        ...("discountValue" in data ? { discountValue: data.discountValue?.toFixed(2) } : {}),
        ...("minimumOrderAmount" in data ? {
          minimumOrderAmount: data.minimumOrderAmount?.toFixed(2),
        } : {}),
        ...("maximumDiscountAmount" in data ? {
          maximumDiscountAmount:
            data.maximumDiscountAmount == null
              ? null
              : data.maximumDiscountAmount.toFixed(2),
        } : {}),
        ...("usageLimit" in data ? { usageLimit: data.usageLimit } : {}),
        ...("startsAt" in data ? { startsAt } : {}),
        ...("expiresAt" in data ? { expiresAt } : {}),
        ...("isActive" in data ? { isActive: data.isActive } : {}),
      },
    });

    return NextResponse.json({ success: true, coupon });
  } catch (error) {
    console.error("Coupon update failed", error);
    return NextResponse.json(
      { error: "Unable to update coupon" },
      { status: 500 }
    );
  }
}
