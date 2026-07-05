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
      source: "/((?!_next/static|_next/image).*)",
      headers: [
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
      ],
    },
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