import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { validOrigin } from "@/lib/admin/origin";

const schema = z.object({ id: z.string().optional(), name: z.string().trim().min(1).max(120), parentId: z.string().nullable().optional(), action: z.enum(["create", "rename", "delete"]) });

export async function GET() {
  if (!await getCurrentAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ folders: await prisma.mediaFolder.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { assets: true, children: true } } } }) });
}

export async function POST(req: NextRequest) {
  if (!await getCurrentAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!validOrigin(req)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid folder details" }, { status: 400 });
  const { id, name, parentId, action } = parsed.data;
  try {
    if (action === "create") return NextResponse.json({ folder: await prisma.mediaFolder.create({ data: { name, parentId: parentId ?? null } }), success: true }, { status: 201 });
    if (!id) return NextResponse.json({ error: "Folder ID is required" }, { status: 400 });
    if (action === "rename") return NextResponse.json({ folder: await prisma.mediaFolder.update({ where: { id }, data: { name } }), success: true });
    const [children, assets] = await Promise.all([prisma.mediaFolder.count({ where: { parentId: id } }), prisma.mediaAsset.count({ where: { folderId: id } })]);
    if (children || assets) return NextResponse.json({ error: "Move or remove this folder's contents first" }, { status: 409 });
    await prisma.mediaFolder.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch { return NextResponse.json({ error: "Folder operation failed" }, { status: 409 }); }
}
