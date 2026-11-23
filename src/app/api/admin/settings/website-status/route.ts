import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { readBoundedBody } from "@/lib/payments/request-guard-stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const statusSchema = z.object({ maintenanceMode: z.boolean() }).strict();

export async function GET() {
  if (!await getCurrentAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const settings = await prisma.storeSettings.findUnique({
      where: { id: "primary" },
      select: { maintenanceMode: true },
    });
    return NextResponse.json(
      { maintenanceMode: settings?.maintenanceMode ?? false },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Unable to load website status." }, { status: 503 });
  }
}

export async function PUT(request: NextRequest) {
  if (!await getCurrentAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (request.headers.get("origin") !== (
    process.env.APP_BASE_URL
      ? new URL(process.env.APP_BASE_URL).origin
      : request.nextUrl.origin
  )) {
    return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  }
  if (!request.body) return NextResponse.json({ error: "Request body is required." }, { status: 400 });
  if (Number(request.headers.get("content-length") || "0") > 256) {
    return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  }

  const bounded = await readBoundedBody(request.body, 256);
  if (!bounded.ok) return NextResponse.json({ error: "Invalid request size." }, { status: bounded.status });
  let body: unknown;
  try { body = JSON.parse(new TextDecoder().decode(bounded.body)); }
  catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = statusSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid website status." }, { status: 400 });

  try {
    const settings = await prisma.storeSettings.upsert({
      where: { id: "primary" },
      create: { id: "primary", maintenanceMode: parsed.data.maintenanceMode },
      update: { maintenanceMode: parsed.data.maintenanceMode },
      select: { maintenanceMode: true },
    });
    return NextResponse.json(
      { success: true, maintenanceMode: settings.maintenanceMode },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Unable to update website status." }, { status: 503 });
  }
}
