import test from "node:test";
import assert from "node:assert/strict";
import { isValidRequestOrigin, trustedPublicOrigin } from "../src/lib/request-origin";

function request(origin: string | null, url: string, forwarded?: string) {
  return {
    headers: new Headers({ ...(origin ? { origin } : {}), ...(forwarded ? { "x-forwarded-host": forwarded } : {}) }),
    nextUrl: new URL(url),
  } as never;
}

function withEnv(values: Record<string, string | undefined>, run: () => void) {
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  try { run(); } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

test("accepts same-origin localhost during development without APP_BASE_URL", () => withEnv({ NODE_ENV: "development", APP_BASE_URL: undefined }, () => {
  assert.equal(isValidRequestOrigin(request("http://localhost:3000", "http://localhost:3000/api")), true);
  assert.equal(trustedPublicOrigin(request("http://localhost:3000", "http://localhost:3000/api")), "http://localhost:3000");
}));

test("uses configured public HTTPS origin when Passenger exposes an internal URL", () => withEnv({ NODE_ENV: "production", APP_BASE_URL: "https://srikalahastikalamkari.in" }, () => {
  const proxied = request("https://srikalahastikalamkari.in", "http://127.0.0.1:3000/api", "attacker.example");
  assert.equal(isValidRequestOrigin(proxied), true);
  assert.equal(trustedPublicOrigin(proxied), "https://srikalahastikalamkari.in");
}));

test("rejects an external Origin even if forwarded headers claim it is trusted", () => withEnv({ NODE_ENV: "production", APP_BASE_URL: "https://srikalahastikalamkari.in" }, () => {
  assert.equal(isValidRequestOrigin(request("https://attacker.example", "http://127.0.0.1:3000", "srikalahastikalamkari.in")), false);
}));

test("fails closed for missing or malformed production configuration", () => withEnv({ NODE_ENV: "production", APP_BASE_URL: undefined }, () => {
  assert.equal(isValidRequestOrigin(request("https://srikalahastikalamkari.in", "https://srikalahastikalamkari.in")), false);
  process.env.APP_BASE_URL = "not a URL";
  assert.equal(isValidRequestOrigin(request("https://srikalahastikalamkari.in", "https://srikalahastikalamkari.in")), false);
}));

test("rejects insecure production base URLs and non-origin APP_BASE_URL values", () => withEnv({ NODE_ENV: "production", APP_BASE_URL: "http://srikalahastikalamkari.in" }, () => {
  assert.equal(isValidRequestOrigin(request("http://srikalahastikalamkari.in", "http://127.0.0.1:3000")), false);
  process.env.APP_BASE_URL = "https://srikalahastikalamkari.in/path";
  assert.equal(isValidRequestOrigin(request("https://srikalahastikalamkari.in", "https://127.0.0.1:3000")), false);
}));
