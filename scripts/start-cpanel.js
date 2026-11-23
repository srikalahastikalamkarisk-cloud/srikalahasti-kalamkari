"use strict";

const fs = require("node:fs");
const path = require("node:path");

function stop(message) {
  console.error(`Production startup blocked: ${message}`);
  process.exit(1);
}

if (Number(process.versions.node.split(".")[0]) !== 22) stop("use the configured Node.js 22 runtime");

let releaseRoot;
let envFile;
try {
  releaseRoot = fs.realpathSync(__dirname);
  const configured = process.env.SK_ENV_FILE;
  if (!configured || !path.isAbsolute(configured)) stop("SK_ENV_FILE must point to the protected server-side environment file");
  const stat = fs.lstatSync(configured);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) stop("the server-side environment file must be a regular file with mode 0600");
  envFile = fs.realpathSync(configured);
  if (envFile === releaseRoot || envFile.startsWith(`${releaseRoot}${path.sep}`)) stop("the environment file must be outside the release directory");
} catch {
  stop("the release root or protected environment file is unavailable");
}

try {
  require("dotenv").config({ path: envFile, quiet: true, override: true });
} catch {
  stop("unable to load the protected environment file");
}

if (process.env.NODE_ENV !== "production") stop("NODE_ENV must be production");
if (!process.env.DATABASE_URL || /build_only|build_placeholder/i.test(process.env.DATABASE_URL)) stop("a production database URL is required");
try {
  if (new URL(process.env.DATABASE_URL).protocol !== "mysql:") stop("DATABASE_URL must use MySQL");
} catch {
  stop("DATABASE_URL is invalid");
}
if (!process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_SESSION_SECRET.length < 32) stop("ADMIN_SESSION_SECRET must be at least 32 characters");
if (!process.env.CUSTOMER_SESSION_SECRET || process.env.CUSTOMER_SESSION_SECRET.length < 32) stop("CUSTOMER_SESSION_SECRET must be at least 32 characters");
if (!process.env.PAYMENT_RECOVERY_SECRET || process.env.PAYMENT_RECOVERY_SECRET.length < 64) stop("PAYMENT_RECOVERY_SECRET must be at least 64 characters");

const mediaRoot = process.env.MEDIA_STORAGE_DIR;
if (!mediaRoot || !path.isAbsolute(mediaRoot)) stop("MEDIA_STORAGE_DIR must be an absolute persistent path");
try {
  const resolvedMedia = fs.realpathSync(mediaRoot);
  const stat = fs.statSync(resolvedMedia);
  if (!stat.isDirectory() || (stat.mode & 0o022) !== 0 || resolvedMedia === releaseRoot || resolvedMedia.startsWith(`${releaseRoot}${path.sep}`)) stop("MEDIA_STORAGE_DIR must be a private directory outside releases");
  fs.accessSync(resolvedMedia, fs.constants.W_OK);
  for (const area of ["products", "categories", "hero-videos", "story-videos"]) {
    const dir = path.join(resolvedMedia, area);
    const resolvedArea = fs.realpathSync(dir);
    const areaStat = fs.statSync(dir);
    if (!resolvedArea.startsWith(`${resolvedMedia}${path.sep}`) || !areaStat.isDirectory() || (areaStat.mode & 0o022) !== 0) stop(`persistent ${area} storage is unavailable or unsafe`);
    fs.accessSync(resolvedArea, fs.constants.W_OK);
  }
} catch {
  stop("MEDIA_STORAGE_DIR and all four media areas must exist and be writable by the app user");
}

if (process.env.RAZORPAY_MODE === "live") {
  if (process.env.RAZORPAY_LIVE_LAUNCH_APPROVED !== "YES") stop("live payments require a separate explicit launch authorization");
  if (!process.env.RAZORPAY_KEY_ID?.startsWith("rzp_live_") || !process.env.RAZORPAY_KEY_SECRET || !process.env.RAZORPAY_WEBHOOK_SECRET) stop("live payment and webhook credentials are incomplete");
}

process.chdir(releaseRoot);
require(path.join(releaseRoot, "server.js"));
