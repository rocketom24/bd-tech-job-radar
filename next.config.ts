import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets tests/db-failure.test.mjs run a second dev server beside the main one.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
