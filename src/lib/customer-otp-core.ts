import { createHash } from "node:crypto";

export function normalizeIndianMobile(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digits = value.replace(/\D/g, "");
  const national = digits.startsWith("91") && digits.length === 12 ? digits.slice(2) : digits;
  return /^[6-9]\d{9}$/.test(national) ? `91${national}` : null;
}

export function isAllowedMsg91VerifyUrl(value: string) {
  return /^https:\/\/(control|api)\.msg91\.com\/api\/v5\/widget\/verifyAccessToken$/.test(value);
}

export function parseMsg91VerifiedIdentity(value: unknown): string | null {
  if (typeof value !== "object" || value === null || !("type" in value) || value.type !== "success" || !("message" in value)) return null;
  return normalizeIndianMobile(value.message);
}

export function maskIndianMobile(value: string) {
  const mobile = normalizeIndianMobile(value);
  return mobile ? `+91 ••••••${mobile.slice(-4)}` : null;
}

export async function verifyMsg91AccessToken(
  token: string,
  authKey: string,
  endpoint: string,
  fetcher: typeof fetch = fetch,
): Promise<{ ok: true; mobile: string } | { ok: false; category: "bad_endpoint" | "provider_rejected" | "provider_response" }> {
  if (!isAllowedMsg91VerifyUrl(endpoint)) return { ok: false, category: "bad_endpoint" };
  const response = await fetcher(endpoint, {
    method: "POST",
    headers: { authkey: authKey, "content-type": "application/json" },
    body: JSON.stringify({ "access-token": token }),
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  let result: unknown;
  try { result = await response.json(); } catch { return { ok: false, category: "provider_response" }; }
  if (!response.ok) return { ok: false, category: "provider_rejected" };
  const mobile = parseMsg91VerifiedIdentity(result);
  return mobile ? { ok: true, mobile } : { ok: false, category: "provider_rejected" };
}

const MSG91_API = "https://api.msg91.com/api/v5/widget";

class Msg91WidgetRejection extends Error {}

async function msg91WidgetJson(path: string, authKey: string, body: Record<string, string>) {
  const response = await fetch(`${MSG91_API}/${path}`, { method: "POST", headers: { accept: "application/json", authkey: authKey, "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(8000) });
  let payload: unknown;
  try { payload = await response.json(); } catch { throw new Error("MSG91 returned an invalid response"); }
  if (typeof payload !== "object" || payload === null || !("type" in payload)) throw new Error("MSG91 OTP request failed");
  if (payload.type !== "success") {
    if (response.ok) throw new Msg91WidgetRejection("MSG91 rejected the OTP operation");
    throw new Error("MSG91 OTP request failed");
  }
  if (!response.ok) throw new Error("MSG91 OTP request failed");
  return payload as Record<string, unknown>;
}

export async function sendMsg91Otp(mobile: string, authKey: string, widgetId: string) {
  const result = await msg91WidgetJson("sendOtp", authKey, { widgetId, identifier: mobile });
  if (typeof result.message !== "string" || result.message.length < 8 || result.message.length > 128) throw new Error("MSG91 did not return an OTP request identifier");
  return result.message;
}

export async function retryMsg91Otp(widgetId: string, requestId: string, authKey: string) {
  await msg91WidgetJson("retryOtp", authKey, { widgetId, reqId: requestId });
}

export async function verifyMsg91Otp(widgetId: string, requestId: string, otp: string, authKey: string): Promise<string | null> {
  let payload: Record<string, unknown>;
  try { payload = await msg91WidgetJson("verifyOtp", authKey, { widgetId, reqId: requestId, otp }); }
  catch (error) { if (error instanceof Msg91WidgetRejection) return null; throw error; }
  if (typeof payload.message !== "string" || payload.message.length < 20 || payload.message.length > 4096) throw new Error("MSG91 did not return an access token");
  return payload.message;
}

export function msg91PendingRequestHash(mobile: string, requestId: string) {
  return createHash("sha256").update(`msg91-widget-request:${mobile}:${requestId}`).digest("hex");
}

export function msg91ConsumedTokenHash(accessToken: string) {
  return createHash("sha256").update(`msg91-widget-consumed:${accessToken}`).digest("hex");
}


export async function getMsg91OtpAnalytics(startDate: string, endDate: string, authKey: string) {
  const query = new URLSearchParams({ startDate, endDate });
  const response = await fetch(`https://control.msg91.com/api/v5/report/analytics/p/widget?${query}`, { method: "GET", headers: { accept: "application/json", authkey: authKey }, cache: "no-store", signal: AbortSignal.timeout(8000) });
  const payload = await response.json().catch(() => null);
  if (!response.ok || typeof payload !== "object" || payload === null) throw new Error("MSG91 analytics unavailable");
  return payload as Record<string, unknown>;
}
