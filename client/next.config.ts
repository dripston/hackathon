import type { NextConfig } from "next";

// Optional same-origin proxy so the console works through a tunnel or deployed URL, where the
// browser can't reach localhost. Set NEXT_PUBLIC_ANTIBODY_URL=/api/antibody and
// NEXT_PUBLIC_DETECTION_URL=/api/detection to use it. Targets are server-side env vars.
const ANTIBODY_URL = process.env.ANTIBODY_URL ?? "http://localhost:4000";
const DETECTION_URL = process.env.DETECTION_URL ?? "http://localhost:5050";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  async rewrites() {
    return [
      { source: "/api/antibody/:path*", destination: `${ANTIBODY_URL}/:path*` },
      { source: "/api/detection/:path*", destination: `${DETECTION_URL}/:path*` },
    ];
  },
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
