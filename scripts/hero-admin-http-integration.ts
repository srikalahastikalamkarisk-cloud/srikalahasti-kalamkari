import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { SignJWT } from "jose";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const TARGET = "srikalahasti_availability_restore_test";
const source = process.env.HERO_TEST_DATABASE_URL;
if (!source) throw new Error("HERO_TEST_DATABASE_URL is required; refusing DATABASE_URL fallback");
const dbUrl = new URL(source);
if (dbUrl.hostname !== "127.0.0.1" || dbUrl.port !== "3306" || dbUrl.pathname !== `/${TARGET}`) throw new Error("Refusing non-isolated Hero test database target");
const base = new URL(process.env.HERO_TEST_SERVER_URL || "http://localhost:3001");
if (![("127.0.0.1"), "localhost", "[::1]"].includes(base.hostname)) throw new Error("Hero HTTP tests must target a loopback server");
const secret = process.env.ADMIN_SESSION_SECRET;
if (!secret || secret.length < 32) throw new Error("ADMIN_SESSION_SECRET is not loaded; load the project .env with dotenv/config");
const prisma = new PrismaClient({ adapter: new PrismaMariaDb(dbUrl.toString()) });
const suffix = randomUUID().replaceAll("-", "");
const createdIds: string[] = [];
let storageKey: string | undefined;
const videoKeys: string[] = [];

async function call(pathname: string, method = "GET", body?: BodyInit, options: { admin?: boolean; origin?: string; contentType?: string } = {}) {
  const headers = new Headers();
  if (options.admin) headers.set("cookie", `sk_admin_session=${session}`);
  if (options.origin !== undefined) headers.set("origin", options.origin);
  else headers.set("origin", base.origin);
  if (options.contentType) headers.set("content-type", options.contentType);
  return fetch(new URL(pathname, base), { method, headers, body, redirect: "manual" });
}

async function expectStatus(response: Response, expected: number, label: string) {
  if (response.status !== expected) {
    throw new Error(`${label}: expected HTTP ${expected}, got ${response.status}: ${await response.text()}`);
  }
}

let session = "";
let mediaAssetId: string | undefined;
async function main() {
  const identity = await prisma.$queryRaw<Array<{ db: string; host: string; port: number }>>`SELECT DATABASE() AS db, @@hostname AS host, @@port AS port`;
  assert.equal(identity[0]?.db, TARGET, "Refusing to test against non-isolated database");
  assert.equal(Number(identity[0]?.port), 3306);
  const migration = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*) AS count FROM information_schema.TABLES WHERE TABLE_SCHEMA = ${TARGET} AND TABLE_NAME = 'HeroSlide'`;
  assert.equal(Number(migration[0]?.count), 1, "HeroSlide migration missing in isolated DB");
  const admin = await prisma.adminUser.findFirst({ where: { isActive: true }, select: { id: true } });
  assert.ok(admin, "Isolated DB needs an existing active admin account");
  session = await new SignJWT({ role: "admin" }).setProtectedHeader({ alg: "HS256" }).setSubject(admin.id).setIssuedAt().setExpirationTime("5m").sign(new TextEncoder().encode(secret));
  console.log(`DATABASE PASS: ${identity[0].db} on ${identity[0].host}:3306; session secret loaded without disclosure`);

  const unauth = await call("/api/admin/hero");
  assert.equal(unauth.status, 401); console.log("PASS: unauthenticated GET rejected");
  const initialResponse = await call("/api/admin/hero", "GET", undefined, { admin: true });
  await expectStatus(initialResponse, 200, "Authenticated Hero GET");
  const initial = (await initialResponse.json() as { slides: Array<{ id: string; sortOrder: number }> }).slides;
  const directIds = (await prisma.heroSlide.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true } })).map(slide => slide.id);
  assert.deepEqual(initial.map(slide => slide.id), directIds, "Test server does not match the verified isolated database; stopping before writes");
  const baselineOrder = initial.map(slide => slide.id);
  const payload = (title: string) => ({ enabled: true, mediaType: "image", desktopImage: "/hero/heritage-desktop.jpg", mobileImage: "/hero/heritage-desktop.jpg", title, highlight: "", eyebrow: "", description: "", primaryLabel: "Shop", primaryHref: "/shop", secondaryLabel: "", secondaryHref: "", transitionMs: 1100, animation: "fade", textPosition: "left", overlayOpacity: 0.45 });

  try {
    let response = await call("/api/admin/hero", "POST", JSON.stringify(payload(`Hero test ${suffix} A`)), { admin: true, contentType: "application/json" });
    await expectStatus(response, 201, "Create first Hero slide");
    const first = (await response.json() as { slide: { id: string; duration: number; videoFallbackMs: number; soundControlsEnabled: boolean; initialMuted: boolean } }).slide; createdIds.push(first.id);
    assert.equal(first.duration, 5000);
    assert.equal(first.videoFallbackMs, 30000);
    assert.equal(first.soundControlsEnabled, true);
    assert.equal(first.initialMuted, true);
    response = await call("/api/admin/hero", "POST", JSON.stringify(payload(`Hero test ${suffix} B`)), { admin: true, contentType: "application/json" });
    await expectStatus(response, 201, "Create second Hero slide");
    const second = (await response.json() as { slide: { id: string } }).slide; createdIds.push(second.id);
    assert.ok(await prisma.heroSlide.findUnique({ where: { id: first.id } }), "HTTP create did not land in isolated DB");
    response = await call("/api/admin/hero", "POST", JSON.stringify({ ...payload(`Pinterest ${suffix}`), mediaType: "pinterest", desktopImage: "", mobileImage: "", desktopSourceUrl: "https://www.pinterest.com/pin/1234567890/" }), { admin: true, contentType: "application/json" });
    await expectStatus(response, 201, "Create Pinterest source slide");
    const pinterest = (await response.json() as { slide: { id: string; desktopSourceUrl: string } }).slide; createdIds.push(pinterest.id);
    assert.equal(pinterest.desktopSourceUrl, "https://www.pinterest.com/pin/1234567890/");
    let homepageResponse = await fetch(base);
    assert.equal(homepageResponse.status, 200);
    let homepageHtml = await homepageResponse.text();
    assert.ok(homepageHtml.includes(`Hero test ${suffix} A`), "Homepage did not render the authenticated database-created slide");
    console.log("PASS: authenticated image and external-source slide creation; 5s image/30s video defaults");

    response = await call("/api/admin/hero", "POST", "{not json", { admin: true, contentType: "application/json" }); assert.equal(response.status, 400);
    response = await call("/api/admin/hero", "POST", JSON.stringify({ ...payload(""), title: "" }), { admin: true, contentType: "application/json" }); assert.equal(response.status, 400);
    response = await call("/api/admin/hero", "POST", JSON.stringify({ ...payload(`Bad URL ${suffix}`), desktopImage: "javascript:alert(1)" }), { admin: true, contentType: "application/json" }); assert.equal(response.status, 400);
    response = await call("/api/admin/hero", "POST", JSON.stringify({ ...payload(`Bad Pinterest ${suffix}`), mediaType: "pinterest", desktopImage: "", mobileImage: "", desktopSourceUrl: "https://pin.it/short" }), { admin: true, contentType: "application/json" }); assert.equal(response.status, 400);
    response = await call("/api/admin/hero", "POST", JSON.stringify({ ...payload(`Bad direct ${suffix}`), mediaType: "direct", desktopImage: "", mobileImage: "", desktopSourceUrl: "http://127.0.0.1/video.mp4" }), { admin: true, contentType: "application/json" }); assert.equal(response.status, 400);
    response = await call("/api/admin/hero", "POST", JSON.stringify(payload(`Bad origin ${suffix}`)), { admin: true, contentType: "application/json", origin: "http://attacker.invalid" }); assert.equal(response.status, 403);
    response = await call("/api/admin/hero", "POST", JSON.stringify({ ...payload(`Too large ${suffix}`), description: "x".repeat(18000) }), { admin: true, contentType: "application/json" }); assert.equal(response.status, 413);
    console.log("PASS: invalid JSON, invalid fields/media URL, invalid Origin, oversized request rejected");

    response = await call(`/api/admin/hero/${first.id}`, "PATCH", JSON.stringify({ title: `Edited ${suffix}` }), { admin: true, contentType: "application/json" }); assert.equal(response.status, 200);
    response = await call(`/api/admin/hero/${first.id}`, "PATCH", JSON.stringify({ enabled: false }), { admin: true, contentType: "application/json" }); assert.equal(response.status, 200);
    assert.equal((await prisma.heroSlide.findUniqueOrThrow({ where: { id: first.id } })).enabled, false);
    response = await call(`/api/admin/hero/${first.id}`, "PATCH", JSON.stringify({ enabled: true }), { admin: true, contentType: "application/json" }); assert.equal(response.status, 200);
    const beforeOrder = [...baselineOrder, first.id, second.id, pinterest.id];
    response = await call("/api/admin/hero/reorder", "PATCH", JSON.stringify({ ids: [...beforeOrder].reverse() }), { admin: true, contentType: "application/json" }); assert.equal(response.status, 200);
    const ordered = await prisma.heroSlide.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true } });
    assert.deepEqual(ordered.map(item => item.id), [...beforeOrder].reverse());
    homepageResponse = await fetch(base);
    homepageHtml = await homepageResponse.text();
    const pinterestPosition = homepageHtml.indexOf(`Pinterest ${suffix}`);
    const firstPosition = homepageHtml.indexOf(`Edited ${suffix}`);
    assert.ok(pinterestPosition >= 0 && firstPosition >= 0 && pinterestPosition < firstPosition, `Homepage did not reflect slide order (Pinterest=${pinterestPosition}, first=${firstPosition})`);
    response = await call(`/api/admin/hero/${first.id}`, "PATCH", JSON.stringify({ enabled: false }), { admin: true, contentType: "application/json" }); assert.equal(response.status, 200);
    homepageHtml = await (await fetch(base)).text();
    assert.ok(!homepageHtml.includes(`Edited ${suffix}`), "Homepage rendered a disabled slide");
    response = await call(`/api/admin/hero/${first.id}`, "PATCH", JSON.stringify({ enabled: true }), { admin: true, contentType: "application/json" }); assert.equal(response.status, 200);
    console.log("PASS: authenticated edit, toggle, and reorder");

    response = await call(`/api/admin/hero/${second.id}`, "DELETE", undefined, { admin: true }); assert.equal(response.status, 200); createdIds.splice(createdIds.indexOf(second.id), 1);
    assert.equal(await prisma.heroSlide.findUnique({ where: { id: second.id } }), null);
    homepageHtml = await (await fetch(base)).text();
    assert.ok(!homepageHtml.includes(`Hero test ${suffix} B`), "Homepage rendered a deleted slide");
    console.log("PASS: authenticated delete");

    const mediaDir = process.env.MEDIA_STORAGE_DIR;
    if (mediaDir && path.isAbsolute(mediaDir)) {
      const form = new FormData();
      form.set("file", new File([new Uint8Array([255, 216, 255, ...Buffer.from(suffix.slice(0, 12))])], `hero-${suffix}.jpg`, { type: "image/jpeg" }));
      response = await call("/api/admin/media", "POST", form, { admin: true });
      await expectStatus(response, 201, "Upload test image");
      {
        const uploaded = (await response.json() as { asset: { id: string; storageKey: string } }).asset;
        storageKey = uploaded.storageKey; mediaAssetId = uploaded.id;
        const mediaResponse = await fetch(new URL(`/api/media/products/${storageKey}`, base));
        assert.equal(mediaResponse.status, 200);
        const createdMedia = await prisma.mediaAsset.findUnique({ where: { id: uploaded.id } });
        assert.ok(createdMedia);
        await prisma.mediaAsset.delete({ where: { id: uploaded.id } });
        mediaAssetId = undefined;
        const imagePath = path.join(mediaDir, "products", storageKey);
        await unlink(imagePath).catch(() => undefined); storageKey = undefined;
        console.log("PASS: authenticated image upload, media serving, and isolated cleanup");
      }

      for (const [mime, extension, brand] of [["video/mp4", "mp4", "mp41"], ["video/webm", "webm", "webm"]] as const) {
        const bytes = new Uint8Array(64);
        if (extension === "mp4") { bytes.set(Buffer.from("ftyp"), 4); bytes.set(Buffer.from(brand), 8); }
        else { bytes.set([0x1a, 0x45, 0xdf, 0xa3]); bytes.set(Buffer.from("webm"), 8); }
        const formData = new FormData(); formData.set("file", new File([bytes], `hero-${suffix}.${extension}`, { type: mime }));
        const videoResponse = await call("/api/admin/hero/upload-video", "POST", formData, { admin: true });
        await expectStatus(videoResponse, 201, `Upload test ${extension.toUpperCase()} video`);
        const uploadedVideo = (await videoResponse.json() as { url: string }).url;
        const filename = uploadedVideo.split("/").pop()!;
        assert.match(filename, new RegExp(`^[a-f0-9-]{36}\\.${extension}$`)); videoKeys.push(filename);
        const rangeResponse = await fetch(new URL(uploadedVideo, base), { headers: { range: "bytes=0-9" } });
        assert.equal(rangeResponse.status, 206); assert.equal(rangeResponse.headers.get("accept-ranges"), "bytes");
        assert.match(rangeResponse.headers.get("content-range") ?? "", /^bytes 0-9\/64$/);
        console.log(`PASS: ${extension.toUpperCase()} upload and HTTP Range playback`);
      }
    } else console.log("SKIP: image/video upload tests; MEDIA_STORAGE_DIR is not configured in .env");
  } finally {
    for (const id of createdIds) {
      await call(`/api/admin/hero/${id}`, "DELETE", undefined, { admin: true }).catch(() => undefined);
      await prisma.heroSlide.deleteMany({ where: { id } });
    }
    if (baselineOrder.length) {
      const restore = await call("/api/admin/hero/reorder", "PATCH", JSON.stringify({ ids: baselineOrder }), { admin: true, contentType: "application/json" });
      assert.equal(restore.status, 200, "Failed to restore original Hero slide order");
    }
    if (mediaAssetId) await prisma.mediaAsset.deleteMany({ where: { id: mediaAssetId } });
    if (storageKey && process.env.MEDIA_STORAGE_DIR) await unlink(path.join(process.env.MEDIA_STORAGE_DIR, "products", storageKey)).catch(() => undefined);
    if (process.env.MEDIA_STORAGE_DIR) for (const filename of videoKeys) await unlink(path.join(process.env.MEDIA_STORAGE_DIR, "hero-videos", filename)).catch(() => undefined);
    await prisma.$queryRaw`SELECT DATABASE() AS db`.then(rows => assert.equal((rows as Array<{ db: string }>)[0]?.db, TARGET));
    const remaining = await prisma.heroSlide.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true } });
    assert.deepEqual(remaining.map(slide => slide.id), baselineOrder, "Hero test records/order were not fully restored");
    console.log("CLEANUP PASS: Hero test records removed and isolated slide order restored");
    await prisma.$disconnect();
  }
}

main().catch(async error => { console.error(error instanceof Error ? error.message : "Hero integration test failed"); process.exitCode = 1; await prisma.$disconnect().catch(() => undefined); });
