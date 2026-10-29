import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // AGENTS.md is maintained by hand (see the file).
  agentRules: false,
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
