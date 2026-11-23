import { NextResponse, type NextRequest } from "next/server";
import { ORIGINAL_THEME_ID, STORE_THEME_BY_ID } from "@/lib/store-themes";
import { prisma } from "@/lib/prisma";
import { createMaintenanceResponse, isMaintenanceProxyExempt } from "@/lib/maintenance/proxy-response";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isMaintenanceProxyExempt(pathname)) return NextResponse.next();

  let maintenanceMode = true;
  let themeId = ORIGINAL_THEME_ID;
  try {
    const settings = await prisma.storeSettings.findUnique({
      where: { id: "primary" },
      select: { maintenanceMode: true, themeId: true },
    });
    maintenanceMode = settings?.maintenanceMode ?? false;
    if (settings?.themeId && STORE_THEME_BY_ID.has(settings.themeId)) themeId = settings.themeId;
  } catch {
    // Fail closed without exposing an internal error or storefront data.
  }

  return createMaintenanceResponse(request, maintenanceMode, themeId);
}

export const config = {
  matcher: [
    "/api/:path*",
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:css|js|mjs|map|png|jpg|jpeg|gif|webp|avif|ico|svg|woff2?|ttf|mp4|webm)$).*)",
  ],
};
