import type { NextRequest } from "next/server";
import { isValidRequestOrigin } from "@/lib/request-origin";

export function validOrigin(req: NextRequest) {
  return isValidRequestOrigin(req);
}
