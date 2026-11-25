import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: process.cwd(),
  outputFileTracingExcludes: {
    "/*": [
      "./.git/**/*",
      "./.env",
      "./.env.*",
      "./backups/**/*",
      "./artifacts/**/*",
      "./logs/**/*",
      "./footer-backups/**/*",
      "./sk-patch-backup-*/**/*",
      "./.next-backup-*/**/*",
      "./.next-before-*/**/*",
      "./.next-stale-*/**/*",
      "./.next-step*/**/*",
      "./.next-hero-test/**/*",
      "./*.bak",
      "./*.backup",
    ],
  },
  // HERO_ISOLATED_TEST_DISTDIR_V1
  ...(process.env.ISOLATED_BUILD_DIST_DIR
    ? { distDir: process.env.ISOLATED_BUILD_DIST_DIR }
    : process.env.HERO_ISOLATED_TEST === "1"
      ? { distDir: ".next-hero-test" }
      : {}),
  /* config options here */
  cacheComponents: false,
  partialPrefetching: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
