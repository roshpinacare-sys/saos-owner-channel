import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  async rewrites() {
    // T-37 dark-keeper law: the keeper's cockpit probe path (underscore-prefixed
    // paths are private/unroutable in the app dir) → the keeper-probe API route.
    return [{ source: "/__keeper_probe", destination: "/api/keeper-probe" }];
  },
};

export default nextConfig;
