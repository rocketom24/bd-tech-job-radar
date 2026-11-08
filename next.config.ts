import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets tests/db-failure.test.mjs run a second dev server beside the main one.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  cacheComponents: true,
  partialPrefetching: true,
  // Dev-only route badge. On mobile every corner collides with UI: bottom corners sit on the
  // fixed Apply dock, top-right on the menu button, top-left on the logo. Hidden; Next.js still
  // shows compile and runtime errors (docs: devIndicators). No effect on production builds.
  devIndicators: false,
  // No CSP yet: an untested policy could break the frontend or the Scalar /docs page (jsDelivr script).
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
