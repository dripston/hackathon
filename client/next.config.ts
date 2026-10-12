import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const server = (process.env.SERVER_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
    const drillAntibody = (process.env.DRILL_ANTIBODY_URL || "http://127.0.0.1:4100").replace(/\/$/, "");
    const drillDetection = (process.env.DRILL_DETECTION_URL || "http://127.0.0.1:5150").replace(/\/$/, "");
    return [
      { source: "/api/antibody/:path*", destination: `${server}/api/antibody/:path*` },
      { source: "/api/detection/:path*", destination: `${server}/api/detection/:path*` },
      { source: "/api/voice/:path*", destination: `${server}/api/voice/:path*` },
      // Gateway readiness: which modules are connected, and the watcher.
      { source: "/api/system/ready", destination: `${server}/ready` },
      // A live drill runs its own sandboxed patient and Antibody on fixed ports next to the backend.
      { source: "/api/drill/antibody/:path*", destination: `${drillAntibody}/:path*` },
      { source: "/api/drill/detection/:path*", destination: `${drillDetection}/:path*` },
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
