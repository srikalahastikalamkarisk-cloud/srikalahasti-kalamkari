import type { NextRequest } from "next/server";

export function validOrigin(req: NextRequest) {
  const configuredOrigin = process.env.APP_BASE_URL
    ? new URL(process.env.APP_BASE_URL).origin
    : req.nextUrl.origin;

  return req.headers.get("origin") === configuredOrigin;
}
