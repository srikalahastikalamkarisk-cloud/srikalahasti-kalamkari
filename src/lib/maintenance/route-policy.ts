const ALWAYS_AVAILABLE_ROUTES = new Set([
  "/api/payments/status",
  "/api/payments/verify",
  "/api/payments/webhook",
  "/api/health",
]);

export function isMaintenanceExemptPath(pathname: string) {
  return pathname === "/maintenance" ||
    pathname === "/admin" || pathname.startsWith("/admin/") ||
    pathname === "/api/admin" || pathname.startsWith("/api/admin/") ||
    ALWAYS_AVAILABLE_ROUTES.has(pathname);
}

export function isApiPath(pathname: string) {
  return pathname === "/api" || pathname.startsWith("/api/");
}

export function shouldShowMaintenance(pathname: string, maintenanceMode: boolean) {
  return maintenanceMode && !isMaintenanceExemptPath(pathname);
}

export const MAINTENANCE_RETRY_AFTER_SECONDS = 3600;
