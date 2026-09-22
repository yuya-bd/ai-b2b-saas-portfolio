import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces .next/standalone, which the runtime Docker stage copies.
  output: "standalone",
};

export default nextConfig;
