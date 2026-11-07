import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets tests/db-failure.test.mjs run a second dev server beside the main one.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  cacheComponents: true,
  partialPrefetching: true,
  // No CSP: the app is API-only today and a guessed policy could break the starter page.
  async headers() {
    const headers = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      // HSTS only in production: sending it from http://localhost would pin browsers to HTTPS there.
      ...(process.env.NODE_ENV === "production"
        ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
        : []),
    ];
    return [{ source: "/:path*", headers }];
  },
};

export default nextConfig;
