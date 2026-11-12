import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next 14: habilita src/instrumentation.ts (boot registry fail-fast)
  experimental: {
    instrumentationHook: true,
  },
  webpack: (config, { nextRuntime }) => {
    // instrumentation.ts também é compilado para edge; o boot usa fs/path/crypto.
    if (nextRuntime === "edge") {
      const nodeBoot = path.join(__dirname, "src/instrumentation.node.ts");
      config.resolve.alias = {
        ...(config.resolve.alias || {}),
        [nodeBoot]: false,
        "./instrumentation.node": false,
        "./instrumentation.node.ts": false,
      };
    }
    return config;
  },
};

export default nextConfig;
