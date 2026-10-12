import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/api/antibody/:path*", destination: `${(process.env.ANTIBODY_URL || "http://127.0.0.1:4000").replace(/\/$/, "")}/:path*` },
      { source: "/api/detection/:path*", destination: `${(process.env.DETECTION_URL || "http://127.0.0.1:5050").replace(/\/$/, "")}/:path*` },
    ];
  },
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
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
