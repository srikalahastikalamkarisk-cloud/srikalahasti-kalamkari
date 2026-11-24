import type { NextRequest } from "next/server";

type OriginRequest = Pick<NextRequest, "headers" | "nextUrl">;

function parseOrigin(value: string | null | undefined): string | null {
  if (!value || value.trim() !== value) return null;
  try {
    const url = new URL(value);
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) return null;
    if (url.origin === "null" || url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function isLoopback(origin: string): boolean {
  const hostname = new URL(origin).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/**
 * Browser CSRF origin check. APP_BASE_URL is the trusted public origin and is
 * deliberately preferred over request.url because Passenger may expose an
 * internal scheme/host. Forwarded headers are never used as trust inputs.
 */
export function isValidRequestOrigin(request: OriginRequest): boolean {
  const origin = parseOrigin(request.headers.get("origin"));
  if (!origin) return false;

  const configured = process.env.APP_BASE_URL;
  if (configured !== undefined && configured !== "") {
    const expected = parseOrigin(configured);
    if (!expected) return false;
    if (process.env.NODE_ENV === "production" && new URL(expected).protocol !== "https:") return false;
    return origin === expected;
  }

  if (process.env.NODE_ENV !== "production") {
    const requestOrigin = parseOrigin(request.nextUrl.origin);
    return requestOrigin !== null && isLoopback(requestOrigin) && origin === requestOrigin;
  }

  return false;
}

/** Return configured public origin for guards that validate structured bodies too. */
export function trustedPublicOrigin(request: OriginRequest): string | null {
  const configured = process.env.APP_BASE_URL;
  if (configured !== undefined && configured !== "") {
    const expected = parseOrigin(configured);
    if (!expected || (process.env.NODE_ENV === "production" && new URL(expected).protocol !== "https:")) return null;
    return expected;
  }
  if (process.env.NODE_ENV !== "production") {
    const requestOrigin = parseOrigin(request.nextUrl.origin);
    return requestOrigin && isLoopback(requestOrigin) ? requestOrigin : null;
  }
  return null;
}
