import { AsyncLocalStorage } from "node:async_hooks";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import type { NextRequest } from "next/server";
import { hash } from "bcryptjs";
import { msg91ConsumedTokenHash, msg91PendingRequestHash } from "../src/lib/customer-otp-core";

Object.defineProperty(globalThis, "AsyncLocalStorage", { value: AsyncLocalStorage, configurable: true });

const urlValue = process.env.CUSTOMER_OTP_TEST_DATABASE_URL;
if (!urlValue) {
  // Keep the file loadable in the ordinary regression suite; no database code is reached without an explicit test URL.
  test("OTP DB suite skipped without explicit isolated database", { skip: "Set CUSTOMER_OTP_TEST_DATABASE_URL to the isolated skk_otp_baseline_verification schema." }, () => {});
}
const guardedUrl = urlValue ?? "mysql://root@127.0.0.1:33318/skk_otp_mariadb114_verified_test";
const testUrl = new URL(guardedUrl);
if (testUrl.hostname !== "127.0.0.1" || testUrl.port !== "33318" || testUrl.pathname !== "/skk_otp_mariadb114_verified_test") {
  throw new Error("Refusing to run OTP DB tests: connection must target 127.0.0.1:33318/skk_otp_mariadb114_verified_test.");
}
const adapter = new PrismaMariaDb({ host: testUrl.hostname, port: Number(testUrl.port), user: decodeURIComponent(testUrl.username), password: decodeURIComponent(testUrl.password), database: testUrl.pathname.slice(1), connectionLimit: 5, allowPublicKeyRetrieval: true });
const db = new PrismaClient({ adapter });
let appPrisma: PrismaClient | undefined;
const ids: string[] = [];
const adminIds: string[] = [];
const otpTokenHashes: string[] = [];
const email = () => `otp-test-${randomUUID()}@example.invalid`;
const originalEnv = new Map<string, string | undefined>();
const env = (name: string, value: string) => {
  if (!originalEnv.has(name)) originalEnv.set(name, process.env[name]);
  process.env[name] = value;
};

env("DATABASE_URL", urlValue!);
env("NODE_ENV", "test");
env("APP_BASE_URL", "http://localhost:3000");
env("CUSTOMER_SESSION_SECRET", "customer-otp-tests-secret-at-least-thirty-two-chars");
env("ADMIN_SESSION_SECRET", "admin-otp-tests-secret-at-least-thirty-two-chars");
env("CUSTOMER_OTP_ENABLED", "true");
env("MSG91_AUTH_KEY", "mock-server-authkey");
env("MSG91_WIDGET_ID", "mock-widget-id");
env("CUSTOMER_OTP_MAX_DAILY_SENDS", "100");
const oldFetch = globalThis.fetch;
let mockProviderMobile = "919876543210";
globalThis.fetch = async (input, init) => {
  const url = new URL(String(input));
  if (url.hostname !== "control.msg91.com" && url.hostname !== "api.msg91.com") throw new Error("Unexpected network access in OTP tests");
  const payload = JSON.parse(String(init?.body ?? "{}")) as Record<string, string>;
  if (url.pathname === "/api/v5/widget/verifyOtp") return Response.json({ type: payload.otp === "000000" ? "error" : "success", message: "mock-provider-access-token-123456789" });
  if (url.pathname === "/api/v5/widget/verifyAccessToken") return Response.json({ type: "success", message: mockProviderMobile });
  if (url.pathname === "/api/v5/widget/retryOtp") return Response.json({ type: "success", message: "retry send successfully" });
  if (url.pathname === "/api/v5/widget/sendOtp") return Response.json({ type: "success", message: `mock-request-${randomUUID()}` });
  if (url.pathname === "/api/v5/report/analytics/p/widget") return Response.json({ data: [], total: { sms: 0, verified: 0, tokenVerified: 0 } });
  throw new Error("Unexpected MSG91 endpoint in test");
};
let requestHarness: Promise<{ createRequestStoreForAPI: typeof import("next/dist/server/async-storage/request-store").createRequestStoreForAPI; workUnitAsyncStorage: typeof import("next/dist/server/app-render/work-unit-async-storage.external").workUnitAsyncStorage; workAsyncStorage: typeof import("next/dist/server/app-render/work-async-storage.external").workAsyncStorage; createWorkStore: typeof import("next/dist/server/async-storage/work-store").createWorkStore }> | undefined;

async function invoke(handler: (request: NextRequest) => Promise<Response>, path: string, options: { method?: string; body?: unknown; cookie?: string } = {}) {
  const url = `http://localhost:3000${path}`;
  const headers = new Headers({ origin: "http://localhost:3000", ...(options.body === undefined ? {} : { "content-type": "application/json" }) });
  if (options.cookie) headers.set("cookie", options.cookie);
  const { NextRequest: NextRequestConstructor } = await import("next/server");
  const request = new NextRequestConstructor(url, { method: options.method ?? (options.body === undefined ? "GET" : "POST"), headers, ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }) });
  requestHarness ??= Promise.all([import("next/dist/server/async-storage/request-store"), import("next/dist/server/app-render/work-unit-async-storage.external"), import("next/dist/server/app-render/work-async-storage.external"), import("next/dist/server/async-storage/work-store")]).then(([requestStore, workUnit, work, workStore]) => ({ createRequestStoreForAPI: requestStore.createRequestStoreForAPI, workUnitAsyncStorage: workUnit.workUnitAsyncStorage, workAsyncStorage: work.workAsyncStorage, createWorkStore: workStore.createWorkStore }));
  const { createRequestStoreForAPI, workUnitAsyncStorage, workAsyncStorage, createWorkStore } = await requestHarness;
  const requestStore = createRequestStoreForAPI(request, new URL(url), { tags: [], expirationsByCacheKind: new Map() }, undefined, undefined, undefined);
  const workStore = createWorkStore({ page: path, renderOpts: { cacheLifeProfiles: { default: { stale: 300, revalidate: 900, expire: 31536000 } }, staticPageGenerationTimeout: 0, cacheComponents: false, validationLevel: "warning", waitUntil: undefined, onClose: () => {}, onAfterTaskError: undefined, experimental: { isRoutePPREnabled: false, authInterrupts: false, useCacheTimeout: 0, durableUseCacheEntries: false } }, buildId: "otp-test", deploymentId: "otp-test", previouslyRevalidatedTags: [] });
  return workAsyncStorage.run(workStore, () => workUnitAsyncStorage.run(requestStore, () => handler(request)));
}

before(async () => {
  if (!urlValue) return;
  await db.$connect();
  const actual = await db.$queryRaw<Array<{ port: number; datadir: string; databaseName: string }>>`SELECT @@port AS port, @@datadir AS datadir, DATABASE() AS databaseName`;
  assert.equal(Number(actual[0].port), 33318);
  assert.equal(actual[0].databaseName, "skk_otp_mariadb114_verified_test");
  assert.match(actual[0].datadir, /skk-otp-mariadb114/);
  await db.storeSettings.upsert({ where: { id: "primary" }, create: { id: "primary", customerOtpEnabled: true }, update: { customerOtpEnabled: true } });
});

after(async () => {
  if (!urlValue) return;
  if (ids.length) {
    const customers = await db.customer.findMany({ where: { id: { in: ids } }, select: { email: true } });
    const emails = customers.flatMap(row => row.email ? [row.email] : []);
    const orders = await db.order.findMany({ where: { OR: [{ customerId: { in: ids } }, ...(emails.length ? [{ customerEmail: { in: emails } }] : [])] }, select: { id: true } });
    const orderIds = orders.map(row => row.id);
    if (orderIds.length) await db.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    if (orderIds.length) await db.order.deleteMany({ where: { id: { in: orderIds } } });
    await db.customerAddress.deleteMany({ where: { customerId: { in: ids } } });
    await db.customerVerificationToken.deleteMany({ where: { customerId: { in: ids } } });
    await db.customerPasswordResetToken.deleteMany({ where: { customerId: { in: ids } } });
    await db.customer.deleteMany({ where: { id: { in: ids } } });
  }
  if (adminIds.length) await db.adminUser.deleteMany({ where: { id: { in: adminIds } } });
  await db.customerOtpActivity.deleteMany({ where: { category: { startsWith: "otp-test-" } } });
  await db.customerOtpAccessToken.deleteMany({ where: { tokenHash: { startsWith: "otp-test-" } } });
  if (otpTokenHashes.length) await db.customerOtpAccessToken.deleteMany({ where: { tokenHash: { in: otpTokenHashes } } });
  await appPrisma?.$disconnect();
  await db.$disconnect();
  globalThis.fetch = oldFetch;
  for (const [name, value] of originalEnv) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});

async function makeCustomer(overrides: { normalizedPhone?: string | null; email?: string; emailVerified?: boolean } = {}) {
  const id = `otp-test-${randomUUID()}`;
  ids.push(id);
  return db.customer.create({ data: {
    id, name: "OTP Integration Customer", email: overrides.email ?? email(), phone: null,
    normalizedPhone: overrides.normalizedPhone ?? null,
    mobileVerifiedAt: overrides.normalizedPhone ? new Date() : null,
    passwordHash: "$2a$10$integrationfixturehashplaceholder000000000000000000000000000",
    emailVerifiedAt: overrides.emailVerified ? new Date() : null,
  } });
}

test("OTP schema preserves customer, address, order, and order-item records while adding verified mobile", { skip: !urlValue }, async () => {
  const customer = await makeCustomer({ emailVerified: true });
  const address = await db.customerAddress.create({ data: { customerId: customer.id, name: customer.name, phone: "+919876543210", address: "12 Test Road", city: "Chennai", state: "Tamil Nadu", pincode: "600001" } });
  const order = await db.order.create({ data: {
    id: `otp-test-order-${randomUUID()}`, orderNumber: `OTPTEST-${randomUUID()}`, customerName: customer.name, customerEmail: customer.email!, customerId: null, customerPhone: "+919876543210",
    address: "12 Test Road", city: "Chennai", state: "Tamil Nadu", pincode: "600001", subtotal: "100.00", totalAmount: "100.00",
    items: { create: [{ productId: "historical-product-id", productName: "Historical variant order item", quantity: 1, unitPrice: "100.00", totalPrice: "100.00", variantSnapshot: { label: "Indigo · Medium" } }] },
  } });
  await db.$executeRawUnsafe("UPDATE `Order` AS o INNER JOIN `Customer` AS c ON c.`email` = o.`customerEmail` SET o.`customerId` = c.`id` WHERE o.`customerId` IS NULL");
  const updated = await db.customer.update({ where: { id: customer.id }, data: { phone: "+919876543210", normalizedPhone: "919876543210", mobileVerifiedAt: new Date() } });
  const [persistedAddress, persistedOrder] = await Promise.all([
    db.customerAddress.findUnique({ where: { id: address.id } }),
    db.order.findUnique({ where: { id: order.id }, include: { items: true } }),
  ]);
  assert.equal(updated.normalizedPhone, "919876543210");
  assert.equal(persistedAddress?.customerId, customer.id);
  assert.equal(persistedOrder?.customerEmail, customer.email);
  assert.deepEqual(persistedOrder?.items[0].variantSnapshot, { label: "Indigo · Medium" });
});

test("unique mobile identities reject duplicate links and concurrent registrations", { skip: !urlValue }, async () => {
  const mobile = `91${Math.floor(6000000000 + Math.random() * 3999999999)}`;
  const first = await makeCustomer({ normalizedPhone: mobile });
  const duplicate = await db.customer.create({ data: { id: `otp-test-${randomUUID()}`, name: "Duplicate", email: email(), passwordHash: "fixture", phone: `+${mobile}`, normalizedPhone: mobile, mobileVerifiedAt: new Date() } }).then(value => value, error => error);
  assert.equal(duplicate.code, "P2002");
  const concurrentMobile = `91${Math.floor(6000000000 + Math.random() * 3999999999)}`;
  const outcomes = await Promise.allSettled([0, 1].map(() => db.customer.create({ data: { id: `otp-test-${randomUUID()}`, name: "Concurrent", email: email(), passwordHash: "fixture", normalizedPhone: concurrentMobile, mobileVerifiedAt: new Date() } })));
  const created = outcomes.filter(result => result.status === "fulfilled");
  const rejected = outcomes.filter(result => result.status === "rejected");
  created.forEach(result => { if (result.status === "fulfilled") ids.push(result.value.id); });
  assert.equal(created.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal((rejected[0] as PromiseRejectedResult).reason.code, "P2002");
  assert.equal(first.normalizedPhone, mobile);
});

test("email uniqueness rejects duplicate identities and does not merge customers", { skip: !urlValue }, async () => {
  const address = email();
  const first = await makeCustomer({ email: address });
  const duplicate = await db.customer.create({ data: { id: `otp-test-${randomUUID()}`, name: "Other identity", email: address, passwordHash: "fixture" } }).then(value => value, error => error);
  assert.equal(duplicate.code, "P2002");
  assert.equal(await db.customer.count({ where: { email: address } }), 1);
  assert.equal(first.normalizedPhone, null);
});

test("replay token insert is unique under concurrency and rolls back atomically with a customer transaction", { skip: !urlValue }, async () => {
  const tokenHash = randomUUID().replaceAll("-", "").padEnd(64, "a").slice(0, 64);
  const expiresAt = new Date(Date.now() + 60_000);
  const results = await Promise.allSettled([0, 1].map(() => db.$transaction(tx => tx.customerOtpAccessToken.create({ data: { id: `otp-test-${randomUUID()}`, tokenHash, expiresAt } }))));
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(results.filter(result => result.status === "rejected").length, 1);

  const rollbackHash = randomUUID().replaceAll("-", "").padEnd(64, "b").slice(0, 64);
  const existing = await makeCustomer();
  await assert.rejects(db.$transaction(async tx => {
    await tx.customerOtpAccessToken.create({ data: { id: `otp-test-${randomUUID()}`, tokenHash: rollbackHash, expiresAt } });
    await tx.customer.create({ data: { id: `otp-test-${randomUUID()}`, name: "Rollback", email: existing.email, passwordHash: "fixture" } });
  }));
  assert.equal(await db.customerOtpAccessToken.count({ where: { tokenHash: rollbackHash } }), 0);
});

test("OTP session version rotation invalidates the prior version and OTP settings toggle dynamically", { skip: !urlValue }, async () => {
  const customer = await makeCustomer({ normalizedPhone: `91${Math.floor(6000000000 + Math.random() * 3999999999)}` });
  const oldVersion = customer.sessionVersion;
  const rotated = await db.customer.update({ where: { id: customer.id }, data: { sessionVersion: { increment: 1 }, lastLoginAt: new Date(), lastLoginMethod: "mobile_otp" } });
  assert.equal(rotated.sessionVersion, oldVersion + 1);
  assert.equal(rotated.lastLoginMethod, "mobile_otp");
  const settings = await db.storeSettings.upsert({ where: { id: "primary" }, create: { id: "primary", customerOtpEnabled: false }, update: { customerOtpEnabled: false } });
  assert.equal(settings.customerOtpEnabled, false);
  await db.storeSettings.update({ where: { id: "primary" }, data: { customerOtpEnabled: true } });
  assert.equal((await db.storeSettings.findUnique({ where: { id: "primary" }, select: { customerOtpEnabled: true } }))?.customerOtpEnabled, true);
  const oldEnv = { master: process.env.CUSTOMER_OTP_ENABLED, auth: process.env.MSG91_AUTH_KEY, widget: process.env.MSG91_WIDGET_ID };
  process.env.CUSTOMER_OTP_ENABLED = "true";
  process.env.MSG91_AUTH_KEY = "mock-server-key";
  process.env.MSG91_WIDGET_ID = "mock-widget-id";
  const { customerOtpEnabled } = await import("../src/lib/customer-otp");
  appPrisma = (await import("../src/lib/prisma")).prisma;
  assert.equal(await customerOtpEnabled(), true);
  process.env.CUSTOMER_OTP_ENABLED = "false";
  assert.equal(await customerOtpEnabled(), false);
  if (oldEnv.master === undefined) delete process.env.CUSTOMER_OTP_ENABLED; else process.env.CUSTOMER_OTP_ENABLED = oldEnv.master;
  if (oldEnv.auth === undefined) delete process.env.MSG91_AUTH_KEY; else process.env.MSG91_AUTH_KEY = oldEnv.auth;
  if (oldEnv.widget === undefined) delete process.env.MSG91_WIDGET_ID; else process.env.MSG91_WIDGET_ID = oldEnv.widget;
});

test("activity records are masked and retention can remove expired activity", { skip: !urlValue }, async () => {
  const recent = await db.customerOtpActivity.create({ data: { id: `otp-test-${randomUUID()}`, maskedPhone: "+91 ••••••3210", outcome: "success", category: "otp-test-retention" } });
  await db.customerOtpActivity.create({ data: { id: `otp-test-${randomUUID()}`, maskedPhone: "+91 ••••••3210", outcome: "failure", category: "otp-test-retention", createdAt: new Date(Date.now() - 31 * 86400_000) } });
  await db.customerOtpActivity.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 30 * 86400_000) }, category: { startsWith: "otp-test-" } } });
  const records = await db.customerOtpActivity.findMany({ where: { category: "otp-test-retention" } });
  assert.equal(records.length, 1);
  assert.equal(records[0].id, recent.id);
  assert.match(records[0].maskedPhone ?? "", /••••••/);
});

test("real OTP request and verification routes create a mobile-only account and reject invalid or replayed codes", { skip: !urlValue }, async () => {
  await db.storeSettings.update({ where: { id: "primary" }, data: { customerOtpEnabled: true, customerEmailLoginEnabled: true } });
  const requestRoute = (await import("../src/app/api/customer/otp/request/route")).POST;
  const verifyRoute = (await import("../src/app/api/customer/otp/verify/route")).POST;
  const phone = `9${Math.floor(100000000 + Math.random() * 899999999)}`;
  const sent = await invoke(requestRoute, "/api/customer/otp/request", { body: { phone: `91${phone}`, action: "send" } });
  assert.equal(sent.status, 200);
  const sendBody = await sent.json() as { sent: boolean; requestId: string };
  otpTokenHashes.push(msg91PendingRequestHash(`91${phone}`, sendBody.requestId));
  assert.equal(sendBody.sent, true);
  assert.ok(sendBody.requestId.startsWith("mock-request-"));
  const retried = await invoke(requestRoute, "/api/customer/otp/request", { body: { phone, action: "resend", requestId: sendBody.requestId } });
  assert.equal(retried.status, 200);
  const invalid = await invoke(verifyRoute, "/api/customer/otp/verify", { body: { phone, requestId: sendBody.requestId, otp: "000000", flow: "register", name: "OTP Only Customer" } });
  assert.equal(invalid.status, 401);
  mockProviderMobile = "919999999999";
  const mismatched = await invoke(verifyRoute, "/api/customer/otp/verify", { body: { phone, requestId: sendBody.requestId, otp: "123456", flow: "register", name: "OTP Only Customer" } });
  assert.equal(mismatched.status, 401);
  const secondSend = await invoke(requestRoute, "/api/customer/otp/request", { body: { phone: `91${phone}`, action: "send" } });
  const secondSendBody = await secondSend.json() as { requestId: string };
  otpTokenHashes.push(msg91PendingRequestHash(`91${phone}`, secondSendBody.requestId), msg91ConsumedTokenHash("mock-provider-access-token-123456789"));
  mockProviderMobile = `91${phone}`;
  const body = { phone, requestId: secondSendBody.requestId, otp: "123456", flow: "register", name: "OTP Only Customer" };
  const verified = await invoke(verifyRoute, "/api/customer/otp/verify", { body });
  assert.equal(verified.status, 200);
  const response = await verified.json() as { emailVerificationRequired: boolean; returnTo: string };
  assert.equal(response.emailVerificationRequired, false);
  assert.equal(response.returnTo, "/account");
  const cookie = verified.headers.get("set-cookie") ?? "";
  assert.match(cookie, /HttpOnly/);
  const customer = await db.customer.findUnique({ where: { normalizedPhone: `91${phone}` } });
  assert.ok(customer);
  ids.push(customer!.id);
  assert.equal(customer!.email, null);
  assert.equal(customer!.emailVerifiedAt, null);
  assert.ok(customer!.mobileVerifiedAt);
  const replay = await invoke(verifyRoute, "/api/customer/otp/verify", { body });
  assert.equal(replay.status, 401);
});

test("real admin controls support both, OTP-only and email-only modes, reject both-off, and preserve sessions", { skip: !urlValue }, async () => {
  const adminRoute = await import("../src/app/api/admin/customer-otp/route");
  const id = `otp-test-admin-${randomUUID()}`;
  adminIds.push(id);
  await db.adminUser.create({ data: { id, name: "OTP Admin Fixture", email: email(), passwordHash: "test-only" } });
  const { createAdminSession, ADMIN_COOKIE } = await import("../src/lib/admin-auth");
  const adminCookie = `${ADMIN_COOKIE}=${await createAdminSession(id)}`;
  await db.storeSettings.upsert({ where: { id: "primary" }, create: { id: "primary", customerOtpEnabled: true, customerEmailLoginEnabled: true }, update: { customerOtpEnabled: true, customerEmailLoginEnabled: true } });
  const report = await invoke(adminRoute.GET, "/api/admin/customer-otp", { cookie: adminCookie });
  assert.equal(report.status, 200);
  const reportData = await report.json() as { enabled: boolean; emailEnabled: boolean; providerUsage: { walletBalance: unknown; today: { sent: number | null; charges: number | null } | null } };
  assert.equal(reportData.enabled, true);
  assert.equal(reportData.emailEnabled, true);
  assert.equal(reportData.providerUsage.walletBalance, null);
  assert.equal(reportData.providerUsage.today?.sent, 0);
  assert.equal(reportData.providerUsage.today?.charges, null);

  const { createCustomerSession, CUSTOMER_COOKIE } = await import("../src/lib/customer-auth").then(async module => ({ ...module, ...(await import("../src/lib/customer-auth-core")) }));
  const customer = await makeCustomer({ normalizedPhone: `91${Math.floor(6000000000 + Math.random() * 3999999999)}` });
  const session = await createCustomerSession(customer.id, customer.sessionVersion);
  const cookie = `${CUSTOMER_COOKIE}=${session}`;
  const otpOnly = await invoke(adminRoute.PUT, "/api/admin/customer-otp", { method: "PUT", body: { emailEnabled: false }, cookie: adminCookie });
  assert.equal(otpOnly.status, 200);
  const loginRoute = (await import("../src/app/api/customer/login/route")).POST;
  assert.equal((await invoke(loginRoute, "/api/customer/login", { body: { email: customer.email, password: "wrong-password" }, cookie })).status, 503);
  const current = (await import("../src/app/api/customer/me/route")).GET;
  assert.equal((await invoke(current, "/api/customer/me", { cookie })).status, 200);

  const emailOnly = await invoke(adminRoute.PUT, "/api/admin/customer-otp", { method: "PUT", body: { enabled: false, emailEnabled: true }, cookie: adminCookie });
  assert.equal(emailOnly.status, 200);
  assert.equal((await invoke(loginRoute, "/api/customer/login", { body: { email: customer.email, password: "wrong-password" } })).status, 401);
  const requestRoute = (await import("../src/app/api/customer/otp/request/route")).POST;
  assert.equal((await invoke(requestRoute, "/api/customer/otp/request", { body: { phone: "9876543210", action: "send" } })).status, 503);
  const bothOff = await invoke(adminRoute.PUT, "/api/admin/customer-otp", { method: "PUT", body: { enabled: false, emailEnabled: false }, cookie: adminCookie });
  assert.equal(bothOff.status, 400);
  await db.storeSettings.update({ where: { id: "primary" }, data: { customerOtpEnabled: true, customerEmailLoginEnabled: true } });
});

test("real email/password login retains verified-email gate and Buy Now return path; guest payment creation rejects", { skip: !urlValue }, async () => {
  await db.storeSettings.update({ where: { id: "primary" }, data: { customerOtpEnabled: true, customerEmailLoginEnabled: true } });
  const loginRoute = (await import("../src/app/api/customer/login/route")).POST;
  const customer = await makeCustomer();
  const password = "otp-email-login-test";
  await db.customer.update({ where: { id: customer.id }, data: { passwordHash: await hash(password, 10) } });
  const rejected = await invoke(loginRoute, "/api/customer/login", { body: { email: customer.email, password, returnTo: "/checkout?buyNow=1" } });
  assert.equal(rejected.status, 403);
  await db.customer.update({ where: { id: customer.id }, data: { emailVerifiedAt: new Date() } });
  const accepted = await invoke(loginRoute, "/api/customer/login", { body: { email: customer.email, password, returnTo: "/checkout?buyNow=1" } });
  assert.equal(accepted.status, 200);
  assert.equal((await accepted.json() as { returnTo: string }).returnTo, "/checkout?buyNow=1");
  const paymentCreate = (await import("../src/app/api/payments/create-order/route")).POST;
  const guest = await invoke(paymentCreate, "/api/payments/create-order", { body: { checkoutKey: `otp-test-${randomUUID()}` } });
  assert.equal(guest.status, 401);
});
