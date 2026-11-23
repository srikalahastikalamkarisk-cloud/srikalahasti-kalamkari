import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET as maintenancePage } from "../src/app/maintenance/route";
import { createMaintenanceResponse } from "../src/lib/maintenance/proxy-response";
import {
  isApiPath,
  isMaintenanceExemptPath,
  MAINTENANCE_RETRY_AFTER_SECONDS,
  shouldShowMaintenance,
} from "../src/lib/maintenance/route-policy";

test("maintenance is default-off and exempts required admin, payment, and health routes", () => {
  const publicPaths = ["/", "/shop", "/product/item", "/api/checkout/preview", "/api/media/products/example.png", "/api/payments/create-order"];
  for (const path of publicPaths) {
    assert.equal(shouldShowMaintenance(path, false), false, `${path} should be live when disabled`);
    assert.equal(shouldShowMaintenance(path, true), true, `${path} should be blocked when enabled`);
  }
  const exempt = [
    "/maintenance", "/admin", "/admin/settings", "/api/admin/settings/website-status",
    "/api/payments/status", "/api/payments/verify", "/api/payments/webhook",
    "/api/health",
  ];
  for (const path of exempt) {
    assert.equal(isMaintenanceExemptPath(path), true, `${path} must stay available`);
    assert.equal(shouldShowMaintenance(path, true), false, `${path} must bypass maintenance`);
  }
  assert.equal(isApiPath("/api/media/products/example.png"), true);
  assert.equal(isApiPath("/shop"), false);
  assert.equal(MAINTENANCE_RETRY_AFTER_SECONDS, 3600);
});

test("maintenance response has premium content, selected palette styling and retry headers", async () => {
  const request = new NextRequest("http://localhost/maintenance", {
    headers: { "x-maintenance-theme-id": "sapphire-blue-03" },
  });
  const response = await maintenancePage(request);
  const html = await response.text();

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("retry-after"), "3600");
  assert.equal(response.headers.get("cache-control"), "no-store, no-cache, must-revalidate");
  assert.match(html, /We're Making Something Beautiful/);
  assert.match(html, /scheduled maintenance to bring you a better shopping experience/);
  assert.match(html, /Website Developed by VenuTrinity/);
  assert.match(html, /href="https:\/\/venutrinity\.in\//);
  assert.match(html, /href="tel:\+919849743774"/);
  assert.match(html, /prefers-reduced-motion:reduce/);
  assert.match(html, /--maintenance-bg:radial-gradient\(ellipse at 50% 35%,/);
  assert.doesNotMatch(html, /DATABASE_URL|stack trace|PrismaClient/);
});

test("isolated maintenance fixture returns 503s while LIVE and exempt routes continue", async () => {
  const page = createMaintenanceResponse(new NextRequest("http://localhost/shop"), true, "burgundy-rose-gold-03");
  assert.equal(page.status, 200, "proxy rewrite continues through the maintenance route handler");
  assert.equal(page.headers.get("x-middleware-rewrite"), "http://localhost/maintenance");

  const api = createMaintenanceResponse(new NextRequest("http://localhost/api/checkout/preview", { method: "POST" }), true);
  assert.equal(api.status, 503);
  assert.equal(api.headers.get("retry-after"), "3600");
  assert.equal(api.headers.get("cache-control"), "no-store, no-cache, must-revalidate");

  const live = createMaintenanceResponse(new NextRequest("http://localhost/shop"), false);
  assert.equal(live.headers.get("x-middleware-next"), "1");
  for (const path of ["/admin/settings", "/api/admin/settings/website-status", "/api/payments/webhook", "/api/payments/verify", "/api/payments/status", "/api/health"]) {
    const passThrough = createMaintenanceResponse(new NextRequest(`http://localhost${path}`), true);
    assert.equal(passThrough.headers.get("x-middleware-next"), "1", `${path} must remain reachable`);
  }
});
