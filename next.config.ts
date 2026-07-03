import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Evita que o Next.js use C:\Users\Stefanie\package-lock.json como raiz
  outputFileTracingRoot: path.join(__dirname),
  images: {
    remotePatterns: [],
  },
};

export default nextConfig;