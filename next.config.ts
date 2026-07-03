import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Evita que o Next.js use C:\Users\Stefanie\package-lock.json como raiz
  outputFileTracingRoot: path.join(__dirname),
  images: {
    remotePatterns: [],
  },
  headers: async () => [
    {
      source: "/sw.js",
      headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
    },
    {
      source: "/manifest.json",
      headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
    },
  ],
};

export default nextConfig;