import { NextResponse, type NextRequest } from "next/server";
import { ORIGINAL_THEME_ID } from "@/lib/store-themes";
import {
  isApiPath,
  isMaintenanceExemptPath,
  MAINTENANCE_RETRY_AFTER_SECONDS,
  shouldShowMaintenance,
} from "./route-policy";

const unavailableHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "Retry-After": String(MAINTENANCE_RETRY_AFTER_SECONDS),
  "X-Robots-Tag": "noindex, nofollow",
};

export function createMaintenanceResponse(
  request: NextRequest,
  maintenanceMode: boolean,
  themeId = ORIGINAL_THEME_ID,
) {
  const { pathname } = request.nextUrl;
  if (!shouldShowMaintenance(pathname, maintenanceMode)) return NextResponse.next();
  if (isApiPath(pathname)) {
    return NextResponse.json(
      { error: "The website is temporarily unavailable for scheduled maintenance." },
      { status: 503, headers: unavailableHeaders },
    );
  }

  const headers = new Headers(request.headers);
  headers.set("x-maintenance-theme-id", themeId);
  return NextResponse.rewrite(new URL("/maintenance", request.url), { request: { headers } });
}

export function isMaintenanceProxyExempt(pathname: string) {
  return isMaintenanceExemptPath(pathname);
}
