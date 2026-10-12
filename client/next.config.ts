import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const server = (process.env.SERVER_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
    return [
      { source: "/api/antibody/:path*", destination: `${server}/api/antibody/:path*` },
      { source: "/api/detection/:path*", destination: `${server}/api/detection/:path*` },
      { source: "/api/voice/:path*", destination: `${server}/api/voice/:path*` },
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
