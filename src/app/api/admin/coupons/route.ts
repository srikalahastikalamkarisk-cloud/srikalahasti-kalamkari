import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { Prisma } from "@/generated/prisma/client";
import {
  moneyAmount,
  positiveMoney,
  validateCouponState,
} from "@/lib/admin/coupon-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const couponSchema = z.object({
  code: z.string()
    .trim()
    .min(3)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/)
    .transform(value => value.toUpperCase()),

  description: z.string().trim().max(500).nullable().optional(),

  discountType: z.enum(["PERCENTAGE", "FIXED"]),

  discountValue: positiveMoney,

  minimumOrderAmount: moneyAmount.default(0),

  maximumDiscountAmount: positiveMoney.nullable().optional(),

  usageLimit: z.number()
    .int().positive().max(100000000).nullable().optional(),

  startsAt: z.iso.datetime({ offset: true }).nullable().optional(),
  expiresAt: z.iso.datetime({ offset: true }).nullable().optional(),
}).strict().superRefine((data, ctx) => {
  if (data.discountType === "PERCENTAGE" && data.discountValue > 100) {
    ctx.addIssue({
      code: "custom",
      path: ["discountValue"],
      message: "Percentage cannot exceed 100",
    });
  }

  if (
    data.startsAt &&
    data.expiresAt &&
    new Date(data.expiresAt) <= new Date(data.startsAt)
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["expiresAt"],
      message: "Expiry must be after start date",
    });
  }

  for (const field of [
    "discountValue",
    "minimumOrderAmount",
    "maximumDiscountAmount",
  ] as const) {
    const value = data[field];
    if (value != null && !Number.isSafeInteger(Math.round(value * 100))) {
      ctx.addIssue({
        code: "custom",
        path: [field],
        message: "Invalid currency amount",
      });
    }
    if (value != null && Math.abs(value * 100 - Math.round(value * 100)) > 1e-6) {
      ctx.addIssue({
        code: "custom",
        path: [field],
        message: "Maximum two decimal places allowed",
      });
    }
  }
});

export async function GET(request: NextRequest) {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const rawPage = Number(request.nextUrl.searchParams.get("page") ?? "1");
  const page = Number.isSafeInteger(rawPage)
    ? Math.max(1, Math.min(100000, rawPage))
    : 1;

  const q = (request.nextUrl.searchParams.get("q") ?? "")
    .trim().slice(0, 100);

  try {
    const where = q
      ? { code: { contains: q } }
      : {};

    const [coupons, total] = await Promise.all([
      prisma.coupon.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * 20,
        take: 20,
      }),
      prisma.coupon.count({ where }),
    ]);

    return NextResponse.json(
      {
        coupons,
        pagination: {
          page,
          limit: 20,
          total,
          pages: Math.max(1, Math.ceil(total / 20)),
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Coupons list failed", error);
    return NextResponse.json(
      { error: "Unable to load coupons" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json(
      { error: "Invalid origin" },
      { status: 403 }
    );
  }

  const raw = await request.json().catch(() => null);
  const parsed = couponSchema.safeParse(raw);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid coupon details",
        issues: parsed.error.issues.map(issue => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 }
    );
  }

  try {
    const data = parsed.data;

    const stateError = validateCouponState({
      discountType: data.discountType,
      discountValue: data.discountValue,
      usageLimit: data.usageLimit ?? null,
      usedCount: 0,
      startsAt: data.startsAt ? new Date(data.startsAt) : null,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      isActive: false,
    });

    if (stateError) {
      return NextResponse.json(
        { error: stateError },
        { status: 400 }
      );
    }

    const existing = await prisma.coupon.findUnique({
      where: { code: data.code },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Coupon code already exists" },
        { status: 409 }
      );
    }

    const coupon = await prisma.coupon.create({
      data: {
        code: data.code,
        description: data.description ?? null,
        discountType: data.discountType,
        discountValue: data.discountValue.toFixed(2),
        minimumOrderAmount: data.minimumOrderAmount.toFixed(2),
        maximumDiscountAmount:
          data.maximumDiscountAmount == null
            ? null
            : data.maximumDiscountAmount.toFixed(2),
        usageLimit: data.usageLimit ?? null,
        startsAt: data.startsAt ? new Date(data.startsAt) : null,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        isActive: false,
        usedCount: 0,
      },
    });

    return NextResponse.json(
      { success: true, coupon },
      { status: 201 }
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Coupon code already exists" },
        { status: 409 }
      );
    }

    console.error("Coupon creation failed", error);

    return NextResponse.json(
      { error: "Unable to create coupon" },
      { status: 500 }
    );
  }
}
