import { NextRequest, NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ADMIN_COOKIE, createAdminSession } from "@/lib/admin-auth";

export const runtime = "nodejs";

const loginSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(1024),
});

const invalidLogin = () =>
  NextResponse.json(
    { error: "Invalid email or password" },
    { status: 401 }
  );

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") ?? "";

    if (!contentType.includes("application/json")) {
      return NextResponse.json(
        { error: "JSON request required" },
        { status: 415 }
      );
    }

    const origin = request.headers.get("origin");

    const configuredOrigin = process.env.APP_BASE_URL
      ? new URL(process.env.APP_BASE_URL).origin
      : request.nextUrl.origin;

    if (!origin || origin !== configuredOrigin) {
      return NextResponse.json(
        { error: "Invalid request origin" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return invalidLogin();
    }

    const admin = await prisma.adminUser.findUnique({
      where: {
        email: parsed.data.email.trim().toLowerCase(),
      },
    });

    if (!admin || !admin.isActive) {
      return invalidLogin();
    }

    const validPassword = await compare(
      parsed.data.password,
      admin.passwordHash
    );

    if (!validPassword) {
      return invalidLogin();
    }

    const token = await createAdminSession(admin.id, admin.sessionVersion);

    const response = NextResponse.json({
      success: true,
      admin: {
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    });

    response.cookies.set(ADMIN_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 12,
    });

    return response;
  } catch (error) {
    console.error("Admin login failed:", error);

    return NextResponse.json(
      { error: "Unable to sign in" },
      { status: 500 }
    );
  }
}
