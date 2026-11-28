import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const verifyRoute = read("../src/app/api/customer/otp/verify/route.ts");
const requestRoute = read("../src/app/api/customer/otp/request/route.ts");
const activityRoute = read("../src/app/api/customer/otp/activity/route.ts");
const adminRoute = read("../src/app/api/admin/customer-otp/route.ts");
const paymentRoute = read("../src/app/api/payments/create-order/route.ts");
const productDetail = read("../src/components/product-detail.tsx");
const checkout = read("../src/components/checkout-customer-form.tsx");

test("OTP verify requires same-origin input, the runtime feature flag, provider verification, and verified identifier equality", () => {
  assert.match(verifyRoute, /isValidRequestOrigin\(request\)/);
  assert.match(verifyRoute, /customerOtpEnabled\(\)/);
  assert.match(verifyRoute, /verifyMsg91Otp\(widgetId, requestId, otp/);
  assert.match(verifyRoute, /verifyMsg91AccessToken\(accessToken, authKey/);
  assert.match(verifyRoute, /tokenHash: msg91ConsumedTokenHash\(accessToken\)/);
  assert.doesNotMatch(verifyRoute, /body\.verified\s*===?\s*true/);
  assert.match(verifyRoute, /customerOtpAccessToken\.create/);
  assert.match(verifyRoute, /tx\.customerOtpAccessToken\.create/);
  assert.match(verifyRoute, /sessionVersion: \{ increment: 1 \}/);
});

test("OTP send gate applies server-side number/IP/global counters and cooldowns", () => {
  assert.match(requestRoute, /customerRateAllowed\(`otp-\$\{action\}-phone`/);
  assert.match(requestRoute, /trustedClientIp\(request\)/);
  assert.match(requestRoute, /customerRateCooldownAllowed\("otp-resend-cooldown"/);
  assert.match(requestRoute, /customerOtpEnabled\(\)/);
  assert.match(requestRoute, /sendMsg91Otp|retryMsg91Otp/);
  assert.match(requestRoute, /msg91PendingRequestHash/);
  assert.match(requestRoute, /customerRateAllowed\("otp-global-daily"/);
  assert.doesNotMatch(requestRoute, /NEXT_PUBLIC_MSG91|loadScript|otp-widget/);
});

test("activity endpoint accepts only masked failure metadata and is feature-gated", () => {
  assert.match(activityRoute, /customerOtpEnabled\(\)/);
  assert.match(activityRoute, /recordOtpActivity\(phone, "failure", "client_otp_verification"\)/);
  assert.doesNotMatch(activityRoute, /accessToken|otpCode|authkey|session/i);
});

test("admin OTP API authorizes both operations and emits only configuration booleans and masked activity", () => {
  assert.equal((adminRoute.match(/getCurrentAdmin\(\)/g) ?? []).length, 2);
  assert.match(adminRoute, /isValidRequestOrigin\(request\)/);
  assert.match(adminRoute, /customerOtpEnabled: parsed\.data\.enabled/);
  assert.doesNotMatch(adminRoute, /MSG91_AUTH_KEY\s*[:,}]|NEXT_PUBLIC_MSG91_TOKEN_AUTH\s*[:,}]|accessToken|passwordHash/);
  assert.match(adminRoute, /maskedPhone/);
});

test("payment order endpoint rejects guests before Razorpay/order creation", () => {
  const guard = paymentRoute.indexOf("const customer = await getCurrentCustomer()");
  const razorpay = paymentRoute.indexOf("const razorpay = getRazorpayClient()");
  assert.ok(guard >= 0 && razorpay > guard);
  assert.match(paymentRoute.slice(guard, razorpay), /if \(!customer\).*status: 401/s);
});

test("Buy Now stores product, quantity and selected variant before returning to Buy Now-only checkout", () => {
  const button = productDetail.match(/buyNow\(p\.id,quantity,selectedVariant\?\.id\);router\.push\("\/checkout\?buyNow=1"\)/);
  assert.ok(button);
  assert.match(checkout, /buyNowOnly \? "\/checkout\?buyNow=1" : "\/checkout"/);
  assert.match(checkout, /mode: buyNowOnly \? "buy-now" : "cart"/);
});
