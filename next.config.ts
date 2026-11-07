// Next.js settings. "standalone" bundles only what the server needs, for a small Docker image.
// Tailwind runs through Turbopack's CSS loader.
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
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
