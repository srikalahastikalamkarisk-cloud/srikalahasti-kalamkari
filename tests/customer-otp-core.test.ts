import test from "node:test";
import assert from "node:assert/strict";
import { isAllowedMsg91VerifyUrl, maskIndianMobile, msg91ConsumedTokenHash, msg91PendingRequestHash, normalizeIndianMobile, parseMsg91VerifiedIdentity, retryMsg91Otp, sendMsg91Otp, verifyMsg91AccessToken, verifyMsg91Otp } from "../src/lib/customer-otp-core";

test("normalizes valid Indian mobiles and rejects malformed or non-Indian values", () => {
  assert.equal(normalizeIndianMobile("98765 43210"), "919876543210");
  assert.equal(normalizeIndianMobile("+91 98765-43210"), "919876543210");
  assert.equal(normalizeIndianMobile("1234567890"), null);
  assert.equal(normalizeIndianMobile("+1 202 555 0123"), null);
  assert.equal(normalizeIndianMobile(null), null);
});

test("accepts only the documented success/message verified identifier contract", () => {
  assert.equal(parseMsg91VerifiedIdentity({ type: "success", message: "919876543210" }), "919876543210");
  assert.equal(parseMsg91VerifiedIdentity({ type: "error", message: "919876543210" }), null);
  assert.equal(parseMsg91VerifiedIdentity({ type: "success", data: "919876543210" }), null);
  assert.equal(parseMsg91VerifiedIdentity({ type: "success", message: "unverified" }), null);
});

test("masks mobile identities and permits only the two official MSG91 widget verify hosts", () => {
  assert.equal(maskIndianMobile("919876543210"), "+91 ••••••3210");
  assert.equal(isAllowedMsg91VerifyUrl("https://control.msg91.com/api/v5/widget/verifyAccessToken"), true);
  assert.equal(isAllowedMsg91VerifyUrl("https://api.msg91.com/api/v5/widget/verifyAccessToken"), true);
  assert.equal(isAllowedMsg91VerifyUrl("https://evil.example/api/v5/widget/verifyAccessToken"), false);
  assert.equal(isAllowedMsg91VerifyUrl("http://control.msg91.com/api/v5/widget/verifyAccessToken"), false);
});

test("server verifier uses the access-token body and server Authkey, accepts only success, and fails closed", async () => {
  let call: { url?: string; init?: RequestInit } = {};
  const mockFetch: typeof fetch = async (input, init) => {
    call = { url: String(input), init };
    return Response.json({ type: "success", message: "+91 98765 43210" });
  };
  assert.deepEqual(await verifyMsg91AccessToken("mock-token", "server-secret", "https://control.msg91.com/api/v5/widget/verifyAccessToken", mockFetch), { ok: true, mobile: "919876543210" });
  assert.equal(call.url, "https://control.msg91.com/api/v5/widget/verifyAccessToken");
  assert.equal(new Headers(call.init?.headers).get("authkey"), "server-secret");
  assert.deepEqual(JSON.parse(String(call.init?.body)), { "access-token": "mock-token" });

  const rejectFetch: typeof fetch = async () => Response.json({ type: "error", message: "Invalid Access Token" });
  assert.deepEqual(await verifyMsg91AccessToken("bad", "server-secret", "https://control.msg91.com/api/v5/widget/verifyAccessToken", rejectFetch), { ok: false, category: "provider_rejected" });
  assert.deepEqual(await verifyMsg91AccessToken("bad", "server-secret", "https://evil.example/verify", mockFetch), { ok: false, category: "bad_endpoint" });
});

test("widget send, retry, and verify use the documented POST contracts and keep provider access tokens server-side", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const mockFetch: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    const path = new URL(String(input)).pathname;
    if (path.endsWith("/sendOtp")) return Response.json({ type: "success", message: "req-123456789" });
    if (path.endsWith("/retryOtp")) return Response.json({ type: "success", message: "Retry accepted" });
    return Response.json({ type: "success", message: "provider-jwt-token-long-enough" });
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;
  try {
    const requestId = await sendMsg91Otp("919876543210", "server-authkey", "widget-123");
    assert.equal(requestId, "req-123456789");
    await retryMsg91Otp("widget-123", requestId, "server-authkey");
    const token = await verifyMsg91Otp("widget-123", requestId, "123456", "server-authkey");
    assert.equal(token, "provider-jwt-token-long-enough");
    assert.deepEqual(calls.map(call => call.url), [
      "https://api.msg91.com/api/v5/widget/sendOtp",
      "https://api.msg91.com/api/v5/widget/retryOtp",
      "https://api.msg91.com/api/v5/widget/verifyOtp",
    ]);
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { widgetId: "widget-123", identifier: "919876543210" });
    assert.deepEqual(JSON.parse(String(calls[1].init?.body)), { widgetId: "widget-123", reqId: requestId });
    assert.deepEqual(JSON.parse(String(calls[2].init?.body)), { widgetId: "widget-123", reqId: requestId, otp: "123456" });
    assert.ok(calls.every(call => new Headers(call.init?.headers).get("authkey") === "server-authkey"));
    assert.equal(msg91PendingRequestHash("919876543210", requestId), msg91PendingRequestHash("919876543210", requestId));
    assert.notEqual(msg91PendingRequestHash("919876543210", requestId), msg91PendingRequestHash("919876543211", requestId));
    assert.equal(msg91ConsumedTokenHash(token), msg91ConsumedTokenHash(token));
  } finally { globalThis.fetch = originalFetch; }
});
