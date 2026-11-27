import { NextRequest, NextResponse } from "next/server";
import { isValidRequestOrigin } from "@/lib/request-origin";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { readBoundedBody } from "@/lib/payments/request-guard-stream";
import { revalidatePath, revalidateTag } from "next/cache";
import { PUBLIC_STORE_SETTINGS_CACHE_TAG } from "@/lib/public-store-settings";
import { assertManagedMediaAvailable, queueReleasedMedia } from "@/lib/admin/global-media-references";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const maxSettingsBodyBytes = 16 * 1024;

const optionalText = (max: number) =>
  z.string().trim().max(max).nullable();

const optionalUrl = z.union([
  z.literal(""),
  z.url().max(191).refine(
    value => value.startsWith("https://"),
    "Only HTTPS URLs are allowed"
  ),
]).nullable();

const settingsSchema = z.object({
  storeName: z.string().trim().min(2).max(150),
  description: optionalText(2000),
  logoUrl: z.union([
    optionalUrl,
    z.string().regex(
      /^\/api\/media\/products\/[a-f0-9-]{36}\.(png|jpg|webp)$/,
      "Choose a valid uploaded logo image"
    ),
  ]),
  faviconUrl: z.union([
    optionalUrl,
    z.string().regex(/^\/api\/media\/products\/[a-f0-9-]{36}\.(png|jpg|webp|ico)$/, "Choose a valid uploaded favicon image"),
  ]),
  contactEmail: z.union([
    z.literal(""),
    z.email().max(191),
  ]).nullable(),
  contactPhone: optionalText(30),
  whatsappNumber: optionalText(30),
  address: optionalText(2000),
  instagramUrl: optionalUrl,
  facebookUrl: optionalUrl,
  youtubeUrl: optionalUrl,
  metaTitle: optionalText(191),
  metaDescription: optionalText(500),
}).strict();

export async function GET() {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const settings = await prisma.storeSettings.findUnique({
      where: { id: "primary" },
    });

    return NextResponse.json(
      {
        settings: settings ?? {
          storeName: "Srikalahasti Kalamkari",
          description: null,
          logoUrl: null,
          faviconUrl: null,
          contactEmail: null,
          contactPhone: null,
          whatsappNumber: null,
          address: null,
          instagramUrl: null,
          facebookUrl: null,
          youtubeUrl: null,
          metaTitle: null,
          metaDescription: null,
        },
        paymentConfiguration: {
          razorpayLiveReady:
            process.env.RAZORPAY_MODE === "live" &&
            Boolean(process.env.RAZORPAY_KEY_ID?.trim().startsWith("rzp_live_")) &&
            Boolean(process.env.RAZORPAY_KEY_SECRET?.trim()),
          webhookSecretConfigured: Boolean(process.env.RAZORPAY_WEBHOOK_SECRET?.trim()),
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Store settings GET failed", error);
    return NextResponse.json(
      { error: "Unable to load store settings" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  if (!isValidRequestOrigin(request)) {
    return NextResponse.json(
      { error: "Invalid origin" },
      { status: 403 }
    );
  }

  if (!request.body) {
    return NextResponse.json(
      { error: "Request body is required." },
      { status: 400 }
    );
  }

  const announcedLength = Number(request.headers.get("content-length") ?? "0");
  if (announcedLength > maxSettingsBodyBytes) {
    return NextResponse.json(
      { error: "Settings request is too large." },
      { status: 413 }
    );
  }

  const bounded = await readBoundedBody(request.body, maxSettingsBodyBytes);
  if (!bounded.ok) {
    return NextResponse.json(
      { error: bounded.status === 413 ? "Settings request is too large." : "Unable to read settings request." },
      { status: bounded.status }
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(bounded.body));
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON." },
      { status: 400 }
    );
  }
  const parsed = settingsSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid settings",
        issues: parsed.error.issues.map(issue => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 }
    );
  }

  try {
    const settings = await prisma.$transaction(async tx => {
      const old = await tx.storeSettings.findUnique({ where: { id: "primary" } });
      await assertManagedMediaAvailable(tx, [parsed.data.logoUrl, parsed.data.faviconUrl]);
      const updated = await tx.storeSettings.upsert({ where: { id: "primary" }, create: { id: "primary", ...parsed.data }, update: parsed.data });
      await queueReleasedMedia(tx, old, updated);
      return updated;
    });

    revalidateTag(PUBLIC_STORE_SETTINGS_CACHE_TAG, { expire: 0 });
    revalidatePath("/", "layout");

    return NextResponse.json(
      { success: true, settings },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Store settings PUT failed", error);
    return NextResponse.json(
      { error: "Unable to save store settings" },
      { status: 500 }
    );
  }
}
