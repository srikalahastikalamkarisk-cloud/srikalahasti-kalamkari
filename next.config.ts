import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
