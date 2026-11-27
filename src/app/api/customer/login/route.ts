import { randomUUID } from "node:crypto";
import { isValidRequestOrigin } from "@/lib/request-origin";
import { compare } from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createCustomerSession } from "@/lib/customer-auth";
import { CUSTOMER_COOKIE, CUSTOMER_SESSION_TTL_SECONDS } from "@/lib/customer-auth-core";
import { customerLoginSchema } from "@/lib/customer-login-input";
import { customerRateAllowed } from "@/lib/customer-rate-limit";

export const runtime = "nodejs";

function diagnostic(requestId: string, details: Record<string, unknown>) {
  if (process.env.NODE_ENV === "development") {
    console.info("customer_login_diagnostic", { requestId, ...details });
  }
}

function reply(requestId: string, status: number, branch: string, body: Record<string, unknown>) {
  diagnostic(requestId, { branch, status });
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
  });
}

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  try {
    if (!isValidRequestOrigin(request)) {
      diagnostic(requestId, { stage: "request", bodyParsed: false, emailPresent: false, emailType: "unavailable", passwordPresent: false, passwordType: "unavailable" });
      return reply(requestId, 400, "invalid_origin", { error: "Invalid request." });
    }

    let input: unknown;
    try {
      input = await request.json();
    } catch {
      diagnostic(requestId, { stage: "request", bodyParsed: false, emailPresent: false, emailType: "unavailable", passwordPresent: false, passwordType: "unavailable" });
      return reply(requestId, 400, "malformed_json", { error: "Invalid email or password." });
    }

    const record = typeof input === "object" && input !== null ? input as Record<string, unknown> : {};
    const emailType = typeof record.email;
    const passwordType = typeof record.password;
    diagnostic(requestId, {
      stage: "request",
      bodyParsed: true,
      emailPresent: Object.hasOwn(record, "email"),
      emailType,
      passwordPresent: Object.hasOwn(record, "password"),
      passwordType,
      returnToType: record.returnTo === null ? "null" : typeof record.returnTo,
    });

    const body = customerLoginSchema.safeParse(input);
    if (!body.success) {
      diagnostic(requestId, {
        stage: "validation",
        zodPassed: false,
        failedFields: [...new Set(body.error.issues.map(issue => issue.path.map(String).join(".")).filter(Boolean))],
        customerLookupExecuted: false,
        passwordVerificationExecuted: false,
        sessionCreationReached: false,
      });
      return reply(requestId, 400, "schema_validation", { error: "Invalid email or password." });
    }
    diagnostic(requestId, { stage: "validation", zodPassed: true });

    const email = body.data.email;
    const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const [ipAllowed, emailAllowed] = await Promise.all([
      customerRateAllowed("login-ip", address, 30, 15 * 60000),
      customerRateAllowed("login-email", email, 12, 15 * 60000),
    ]);
    if (!ipAllowed || !emailAllowed) {
      diagnostic(requestId, { stage: "rate_limit", allowed: false, customerLookupExecuted: false, passwordVerificationExecuted: false, sessionCreationReached: false });
      return reply(requestId, 429, "rate_limited", { error: "Too many attempts. Please wait before trying again." });
    }

    const customer = await prisma.customer.findUnique({ where: { email } });
    diagnostic(requestId, { stage: "customer_lookup", customerLookupExecuted: true, customerFound: Boolean(customer) });
    if (!customer) {
      diagnostic(requestId, { stage: "password_verification", passwordVerificationExecuted: false, sessionCreationReached: false });
      return reply(requestId, 401, "credentials_rejected", { error: "Invalid email or password." });
    }

    const passwordMatches = await compare(body.data.password, customer.passwordHash);
    diagnostic(requestId, { stage: "password_verification", passwordVerificationExecuted: true, passwordMatched: passwordMatches });
    if (!passwordMatches) {
      diagnostic(requestId, { sessionCreationReached: false });
      return reply(requestId, 401, "credentials_rejected", { error: "Invalid email or password." });
    }
    if (!customer.emailVerifiedAt) {
      diagnostic(requestId, { stage: "verification_gate", verified: false, sessionCreationReached: false });
      return reply(requestId, 403, "email_unverified", { error: "Please verify your email before signing in.", verificationRequired: true });
    }

    diagnostic(requestId, { stage: "session_creation", sessionCreationReached: true });
    const token = await createCustomerSession(customer.id, customer.sessionVersion);
    const response = reply(requestId, 200, "login_succeeded", {
      success: true,
      returnTo: body.data.returnTo === "/checkout" ||
        body.data.returnTo === "/checkout?buyNow=1"
          ? body.data.returnTo
          : "/account",
    });
    response.cookies.set(CUSTOMER_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: CUSTOMER_SESSION_TTL_SECONDS,
    });
    diagnostic(requestId, { stage: "session_created", sessionCookieSet: true });
    return response;
  } catch (error) {
    diagnostic(requestId, { branch: "server_error", status: 503, errorName: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ error: "Unable to sign in right now." }, { status: 503, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
  }
}
