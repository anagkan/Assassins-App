import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
  experimental: {
    // Forms are text only (the largest is a game's rules), so keep request bodies small.
    serverActions: { bodySizeLimit: "256kb" },
  },
};

export default nextConfig;
