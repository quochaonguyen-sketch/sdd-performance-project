import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const nextConfig = (phase: string): NextConfig => ({
  // Keep local route manifests separate from production builds and rebuild them on startup.
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-local" : ".next",
  experimental: { turbopackFileSystemCacheForDev: false },
  allowedDevOrigins: ["172.17.32.44"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
});

export default nextConfig;
