import type { NextRequest } from "next/server";

export function validOrigin(req: NextRequest) {
  return req.headers.get("origin") === req.nextUrl.origin;
}
